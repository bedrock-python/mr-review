from __future__ import annotations

import json
import textwrap
from collections.abc import AsyncIterator
from uuid import UUID

import httpx

from mr_review.core.reviews.entities import BriefPreset, Review, ReviewStage
from mr_review.infra.ai.claude import ClaudeProvider
from mr_review.infra.ai.openai_compat import OpenAICompatProvider
from mr_review.infra.repositories.host import SQLiteHostRepository
from mr_review.infra.repositories.review import SQLiteReviewRepository
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
    Respond with a single JSON array of comment objects. Each object must have:
    - "file": string or null (relative file path, null for general comments)
    - "line": integer or null (line number in the new version, null for general comments)
    - "severity": one of "critical", "major", "minor", "suggestion"
    - "body": string (the review comment in Markdown)

    Output only valid JSON — no explanation, no code fences.
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

    sections.append(f"## Output Format\n\n{_OUTPUT_SCHEMA}")

    return "\n\n".join(sections)


def _format_diff(diff_files: list[object]) -> str:
    from mr_review.core.mrs.entities import DiffFile

    lines: list[str] = []
    for df in diff_files:
        if not isinstance(df, DiffFile):
            continue
        old = df.old_path or df.path
        lines.append(f"--- a/{old}")
        lines.append(f"+++ b/{df.path}")
        for hunk in df.hunks:
            lines.append(f"@@ -{hunk.old_start},{hunk.old_count} +{hunk.new_start},{hunk.new_count} @@")
            for line in hunk.lines:
                prefix = {"context": " ", "added": "+", "removed": "-"}[line.type]
                lines.append(f"{prefix}{line.content}")
    return "\n".join(lines)


class DispatchReviewUseCase:
    def __init__(
        self,
        review_repo: SQLiteReviewRepository,
        host_repo: SQLiteHostRepository,
    ) -> None:
        self._review_repo = review_repo
        self._host_repo = host_repo

    async def execute(
        self,
        review_id: UUID,
        ai_config: dict[str, str],
    ) -> AsyncIterator[str]:
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        host = await self._host_repo.get_by_id(review.host_id)
        if host is None:
            raise ValueError(f"Host {review.host_id} not found")

        async with httpx.AsyncClient(timeout=60) as client:
            provider = create_vcs_provider(host, client)
            mr = await provider.get_mr(repo_path=review.repo_path, mr_iid=review.mr_iid)
            diff_files = await provider.get_diff(repo_path=review.repo_path, mr_iid=review.mr_iid)

        diff_text = _format_diff(diff_files)  # type: ignore[arg-type]
        prompt = _build_prompt(review, diff_text, mr.title, mr.description)

        # Transition to dispatch stage
        updated = review.model_copy(update={"stage": ReviewStage.dispatch})
        await self._review_repo.update(updated)

        return self._stream_and_save(review_id, prompt, ai_config)

    async def _stream_and_save(
        self,
        review_id: UUID,
        prompt: str,
        ai_config: dict[str, str],
    ) -> AsyncIterator[str]:
        provider_name = ai_config.get("provider", "claude")
        api_key = ai_config.get("api_key", "")
        model = ai_config.get("model", "")
        base_url = ai_config.get("base_url")

        ai: ClaudeProvider | OpenAICompatProvider
        if provider_name == "claude":
            ai = ClaudeProvider(api_key=api_key, model=model or "claude-opus-4-5")
        else:
            ai = OpenAICompatProvider(
                api_key=api_key,
                model=model or "gpt-4o",
                base_url=base_url or None,
            )

        accumulated = ""
        stream = await ai.dispatch(prompt)
        async for chunk in stream:
            accumulated += chunk
            yield chunk

        # Attempt to parse and persist the AI response
        await self._persist_ai_response(review_id, accumulated)

    async def _persist_ai_response(self, review_id: UUID, raw: str) -> None:
        from uuid import uuid4

        from mr_review.core.reviews.entities import Comment

        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            return

        try:
            data: list[dict[str, object]] = json.loads(raw.strip())
        except json.JSONDecodeError:
            # Best-effort: if the AI didn't return valid JSON, store as a single general comment
            data = [{"file": None, "line": None, "severity": "suggestion", "body": raw}]

        comments: list[Comment] = []
        for item in data:
            severity = str(item.get("severity", "suggestion"))
            if severity not in ("critical", "major", "minor", "suggestion"):
                severity = "suggestion"
            comments.append(
                Comment(
                    id=uuid4(),
                    file=str(item["file"]) if item.get("file") else None,
                    line=int(str(item["line"])) if item.get("line") else None,
                    severity=severity,
                    body=str(item.get("body", "")),
                )
            )

        updated = review.model_copy(update={"stage": ReviewStage.polish, "comments": comments})
        await self._review_repo.update(updated)
