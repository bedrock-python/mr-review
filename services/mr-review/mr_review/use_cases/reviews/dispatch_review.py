from __future__ import annotations

import json
import re
import textwrap
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from uuid import UUID, uuid4

import httpx

from mr_review.core.ai_providers.entities import AIProvider
from mr_review.core.mrs.entities import DiffFile
from mr_review.core.reviews.entities import BriefPreset, Comment, Review, ReviewStage
from mr_review.infra.ai.claude import ClaudeProvider
from mr_review.infra.ai.openai_compat import OpenAICompatProvider
from mr_review.infra.repositories.ai_provider import FileAIProviderRepository
from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.repositories.review import FileReviewRepository
from mr_review.infra.vcs.factory import create_vcs_provider

_PRESET_INSTRUCTIONS: dict[BriefPreset, str] = {
    BriefPreset.thorough: (
        "Perform a thorough code review. Identify bugs, logic errors, missing edge cases, "
        "code smells, naming issues, and opportunities to simplify."
    ),
    BriefPreset.security: (
        "Focus on security issues: injection vulnerabilities, authentication/authorization flaws, "
        "insecure defaults, sensitive data exposure, and cryptographic weaknesses."
    ),
    BriefPreset.style: (
        "Review for code style, readability, and consistency: naming conventions, code organisation, "
        "documentation, and adherence to idiomatic patterns for the language."
    ),
    BriefPreset.performance: (
        "Focus on performance: algorithmic complexity, unnecessary allocations, N+1 queries, "
        "blocking operations, and opportunities to cache or batch."
    ),
}

_OUTPUT_SCHEMA = textwrap.dedent("""
    ## Output Format

    You MUST respond with ONLY a valid JSON array. No explanation, no markdown, no code fences.
    Start your response with `[` and end it with `]`.

    Each element in the array is an object with exactly these fields:
    - "file": string or null — relative path to the file being commented on; null for general MR-level comments
    - "line": integer or null — line number in the new version of the file; null if the comment is not line-specific
    - "severity": one of exactly: "critical", "major", "minor", "suggestion"
    - "body": string — the review comment written in Markdown

    Example of a valid response:
    [
      {"file": "src/auth/login.py", "line": 42, "severity": "critical",
       "body": "SQL injection risk: concatenated user input. Use parameterised queries."},
      {"file": "src/utils.py", "line": null, "severity": "minor", "body": "This module has no unit tests."},
      {"file": null, "line": null, "severity": "suggestion", "body": "Consider adding a changelog entry for this MR."}
    ]

    Rules:
    - Output ONLY the JSON array — nothing before `[` or after `]`
    - Do NOT wrap the output in markdown code fences (no ```json or ```)
    - Every object MUST have all four fields
    - "severity" MUST be one of: critical, major, minor, suggestion
    - "body" MUST be non-empty
""").strip()


def _build_prompt(review: Review, diff_text: str, mr_title: str, mr_description: str) -> str:
    config = review.brief_config
    instructions = _PRESET_INSTRUCTIONS.get(config.preset, _PRESET_INSTRUCTIONS[BriefPreset.thorough])

    sections: list[str] = []

    sections.append(f"# Code Review Task\n\n{instructions}")

    if config.custom_instructions:
        sections.append(f"## Additional Instructions\n\n{config.custom_instructions}")

    if config.include_description:
        sections.append(f"## MR Title\n\n{mr_title}\n\n## MR Description\n\n{mr_description or '(none)'}")

    if config.include_diff:
        sections.append(f"## Diff\n\n```diff\n{diff_text}\n```")

    sections.append(_OUTPUT_SCHEMA)

    return "\n\n".join(sections)


def _format_diff(diff_files: list[DiffFile]) -> str:
    lines: list[str] = []
    for df in diff_files:
        old = df.old_path or df.path
        lines.append(f"--- a/{old}")
        lines.append(f"+++ b/{df.path}")
        for hunk in df.hunks:
            lines.append(f"@@ -{hunk.old_start},{hunk.old_count} +{hunk.new_start},{hunk.new_count} @@")
            for line in hunk.lines:
                prefix = {"context": " ", "added": "+", "removed": "-"}[line.type]
                lines.append(f"{prefix}{line.content}")
    return "\n".join(lines)


_VALID_SEVERITIES = frozenset({"critical", "major", "minor", "suggestion"})

# Matches ```json ... ``` or ``` ... ``` fences (dotall)
_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)
# Fallback: find first '[' … last ']' in the string
_ARRAY_RE = re.compile(r"(\[[\s\S]*\])")


@dataclass
class CommentParseError:
    index: int
    raw: object
    reason: str


@dataclass
class ParseResult:
    comments: list[Comment] = field(default_factory=list)
    errors: list[CommentParseError] = field(default_factory=list)
    json_error: str | None = None


def _extract_json(raw: str) -> str:
    """Strip markdown fences and return the best JSON candidate from the LLM output."""
    stripped = raw.strip()

    # Try to unwrap ```json ... ``` or ``` ... ```
    fence_match = _FENCE_RE.search(stripped)
    if fence_match:
        return fence_match.group(1).strip()

    # Try to find a bare JSON array anywhere in the text
    array_match = _ARRAY_RE.search(stripped)
    if array_match:
        return array_match.group(1).strip()

    return stripped


def _parse_comment(index: int, item: object) -> tuple[Comment | None, CommentParseError | None]:
    """Validate and convert a single raw dict to a Comment, returning (comment, None) or (None, error)."""
    if not isinstance(item, dict):
        return None, CommentParseError(index=index, raw=item, reason=f"Expected object, got {type(item).__name__}")

    body = item.get("body")
    if not isinstance(body, str) or not body.strip():
        return None, CommentParseError(index=index, raw=item, reason="Missing or empty 'body' field")

    severity_raw = item.get("severity", "suggestion")
    if not isinstance(severity_raw, str) or severity_raw not in _VALID_SEVERITIES:
        severity = "suggestion"
    else:
        severity = severity_raw

    file_raw = item.get("file")
    file_val: str | None = str(file_raw).strip() if isinstance(file_raw, str) and file_raw.strip() else None

    line_raw = item.get("line")
    line_val: int | None = None
    if line_raw is not None:
        try:
            digits = "".join(c for c in str(line_raw) if c.isdigit())
            line_val = int(digits) if digits else None
        except (ValueError, TypeError):
            line_val = None

    return (
        Comment(id=uuid4(), file=file_val, line=line_val, severity=severity, body=body.strip()),
        None,
    )


def parse_ai_response(raw: str) -> ParseResult:
    """
    Parse a raw LLM response into Comments.

    Handles:
    - Markdown code fences (```json ... ```)
    - Partial JSON recovery — imports valid items, records per-item errors
    - Returns ParseResult with comments, per-item errors, and optional top-level json_error
    """
    result = ParseResult()
    candidate = _extract_json(raw)

    try:
        data = json.loads(candidate)
    except json.JSONDecodeError as exc:
        result.json_error = f"Invalid JSON: {exc}"
        return result

    if not isinstance(data, list):
        result.json_error = f"Expected a JSON array, got {type(data).__name__}"
        return result

    for i, item in enumerate(data):
        comment, error = _parse_comment(i, item)
        if comment is not None:
            result.comments.append(comment)
        else:
            result.errors.append(error)  # type: ignore[arg-type]

    return result


class DispatchReviewUseCase:
    def __init__(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
        ai_provider_repo: FileAIProviderRepository,
    ) -> None:
        self._review_repo = review_repo
        self._host_repo = host_repo
        self._ai_provider_repo = ai_provider_repo

    async def execute(
        self,
        review_id: UUID,
        ai_provider_id: UUID,
        model: str | None = None,
    ) -> AsyncIterator[str]:
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        host = await self._host_repo.get_by_id(review.host_id)
        if host is None:
            raise ValueError(f"Host {review.host_id} not found")

        ai_provider = await self._ai_provider_repo.get_by_id(ai_provider_id)
        if ai_provider is None:
            raise ValueError(f"AI provider {ai_provider_id} not found")

        async with httpx.AsyncClient(timeout=60) as client:
            provider = create_vcs_provider(host, client)
            mr = await provider.get_mr(repo_path=review.repo_path, mr_iid=review.mr_iid)
            diff_files = await provider.get_diff(repo_path=review.repo_path, mr_iid=review.mr_iid)

        diff_text = _format_diff(diff_files)
        prompt = _build_prompt(review, diff_text, mr.title, mr.description)

        updated = review.model_copy(update={"stage": ReviewStage.dispatch})
        await self._review_repo.update(updated)

        return self._stream_and_save(review_id, prompt, ai_provider, model=model)

    async def _stream_and_save(
        self,
        review_id: UUID,
        prompt: str,
        ai_provider: AIProvider,
        model: str | None = None,
    ) -> AsyncIterator[str]:
        ai: ClaudeProvider | OpenAICompatProvider
        if ai_provider.type == "claude":
            resolved_model = model or (ai_provider.models[0] if ai_provider.models else "claude-opus-4-5")
            ai = ClaudeProvider(
                api_key=ai_provider.api_key,
                model=resolved_model,
                ssl_verify=ai_provider.ssl_verify,
                timeout=ai_provider.timeout,
            )
        else:
            resolved_model = model or (ai_provider.models[0] if ai_provider.models else "gpt-4o")
            ai = OpenAICompatProvider(
                api_key=ai_provider.api_key,
                model=resolved_model,
                base_url=ai_provider.base_url or None,
                ssl_verify=ai_provider.ssl_verify,
                timeout=ai_provider.timeout,
            )

        accumulated = ""
        stream = await ai.dispatch(prompt)
        async for chunk in stream:
            accumulated += chunk
            yield chunk

        await self._persist_ai_response(review_id, accumulated)

    async def _persist_ai_response(self, review_id: UUID, raw: str) -> None:
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            return

        result = parse_ai_response(raw)
        if result.json_error is not None:
            fallback = Comment(id=uuid4(), file=None, line=None, severity="suggestion", body=raw.strip())
            comments = [fallback]
        else:
            comments = result.comments
        updated = review.model_copy(update={"stage": ReviewStage.polish, "comments": comments})
        await self._review_repo.update(updated)
