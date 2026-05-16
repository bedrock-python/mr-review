from __future__ import annotations

import textwrap

from mr_review.core.mrs.entities import DiffFile
from mr_review.core.reviews.entities import BriefConfig, BriefPreset

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


def _code_files_section(heading: str, files: dict[str, str]) -> str:
    parts = [f"### {path}\n\n```\n{content}\n```" for path, content in files.items()]
    return f"## {heading}\n\n" + "\n\n---\n\n".join(parts)


def _commit_history_section(commit_history: dict[str, list[dict[str, str]]]) -> str:
    lines: list[str] = []
    for file_path, commits in commit_history.items():
        lines.append(f"### {file_path}")
        lines.extend(f"- `{c['id']}` {c['date'][:10]} **{c['author']}**: {c['title']}" for c in commits)
    return "## Commit History\n\n" + "\n\n".join(lines)


def _append_code_context(
    sections: list[str],
    full_files: dict[str, str] | None,
    test_files: dict[str, str] | None,
    related_code: dict[str, str] | None,
    commit_history: dict[str, list[dict[str, str]]] | None,
) -> None:
    if full_files:
        sections.append(_code_files_section("Changed Files (Full Content)", full_files))
    if test_files:
        sections.append(_code_files_section("Test Context", test_files))
    if related_code:
        sections.append(_code_files_section("Related Code", related_code))
    if commit_history:
        sections.append(_commit_history_section(commit_history))


def build_prompt(
    brief_config: BriefConfig,
    diff_text: str,
    mr_title: str,
    mr_description: str,
    context_contents: dict[str, str] | None = None,
    full_files: dict[str, str] | None = None,
    test_files: dict[str, str] | None = None,
    related_code: dict[str, str] | None = None,
    commit_history: dict[str, list[dict[str, str]]] | None = None,
) -> str:
    config = brief_config
    instructions = _PRESET_INSTRUCTIONS.get(config.preset, _PRESET_INSTRUCTIONS[BriefPreset.thorough])

    sections: list[str] = [f"# Code Review Task\n\n{instructions}"]

    if config.custom_instructions:
        sections.append(f"## Additional Instructions\n\n{config.custom_instructions}")

    if context_contents:
        parts = [f"### {path}\n\n{content}" for path, content in context_contents.items()]
        sections.append("## Project Context\n\n" + "\n\n---\n\n".join(parts))

    if config.include_description:
        sections.append(f"## MR Title\n\n{mr_title}\n\n## MR Description\n\n{mr_description or '(none)'}")

    if config.include_diff:
        sections.append(f"## Diff\n\n```diff\n{diff_text}\n```")

    _append_code_context(sections, full_files, test_files, related_code, commit_history)

    sections.append(_OUTPUT_SCHEMA)

    return "\n\n".join(sections)


def format_diff(diff_files: list[DiffFile]) -> str:
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
