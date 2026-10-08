"""Turning a brief and the material gathered for it into the prompt, within a size budget.

Layout, top to bottom: the task (preset instructions, additional instructions, focus areas),
project context, MR title and description, comments already reported, the diff, full files,
tests, related code, commit history, and the output format.

Budget (``BriefConfig.prompt_budget_chars``): the output format always goes in, and the task —
however long the saved or additional instructions — takes at most a quarter of the budget (cut
from the end, with a marker). The rest is added in priority order — diff, description, previous
comments, project context, full files, tests, related code, commit history — item by item (a
file, a comment) while it fits. The first item that does not fit is cut short at a line break
when at least ``_MIN_PARTIAL_CHARS`` of it fits; the rest of that section is left out, with a
note in the prompt naming what is missing.
Lower-priority sections then get whatever room is left. Every file is also capped at
``MAX_FILE_CHARS``, and file content that looks binary is skipped.
"""

from __future__ import annotations

import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Final

from mr_review.core.mrs.entities import DiffFile, DiffHunk
from mr_review.core.review_presets.entities import BUILTIN_PRESETS
from mr_review.core.reviews.entities import BriefConfig, Comment
from mr_review.core.reviews.severity import severities_at_least
from mr_review.use_cases.reviews.context_files import GatheredContext

MAX_FILE_CHARS: Final = 50_000
# The most of the budget the task text (intent, additional instructions, focus areas) may take.
_TASK_SHARE: Final = 0.25
# An item is cut short only when at least this much of it fits; otherwise it is left out.
_MIN_PARTIAL_CHARS: Final = 2_000
# Room kept free in a section that does not fit whole, for the note on what was left out.
_NOTE_RESERVE: Final = 600
_PREVIOUS_BODY_CHARS: Final = 400
_BINARY_SAMPLE_CHARS: Final = 8_000
# Hosts decode files as UTF-8, replacing what is not. Source in a legacy 8-bit encoding (cp1252,
# cp1251) comes out with a U+FFFD per accented letter — a few percent of the text — and is still
# worth reviewing; only text that is mostly replacement characters is binary.
_BINARY_REPLACEMENT_SHARE: Final = 0.3
_SECTION_JOIN: Final = "\n\n"
_FILE_SEPARATOR: Final = "\n\n---\n\n"
_DIFF_PREFIX: Final = {"context": " ", "added": "+", "removed": "-"}
_BACKTICK_RUN_RE: Final = re.compile(r"`{3,}")


def looks_binary(content: str) -> bool:
    """NUL bytes, or mostly U+FFFD (bytes that were not UTF-8), at the start of the text."""
    sample = content[:_BINARY_SAMPLE_CHARS]
    if "\x00" in sample:
        return True
    return bool(sample) and sample.count("�") / len(sample) > _BINARY_REPLACEMENT_SHARE


def _fence(*texts: str) -> str:
    """A code fence longer than any backtick run inside ``texts``, so the block cannot end early."""
    longest = max((len(m.group()) for text in texts for m in _BACKTICK_RUN_RE.finditer(text)), default=2)
    return "`" * max(3, longest + 1)


def _cut(text: str, room: int) -> str:
    """``text`` within ``room`` characters, ended at a line break where possible, with a marker."""
    marker_room = len(f"\n… [cut: {len(text):,} of {len(text):,} characters shown]")
    keep = max(0, room - marker_room)
    end = text.rfind("\n", 0, keep + 1)
    if end < keep // 2:
        end = keep
    shown = text[:end]
    return f"{shown}\n… [cut: {len(shown):,} of {len(text):,} characters shown]"


@dataclass(frozen=True, slots=True)
class _Item:
    """One file or comment of a section: ``head + content + tail``; only ``content`` is ever cut."""

    name: str
    head: str
    content: str
    tail: str = ""
    source_chars: int = 0
    capped: bool = False

    def render(self) -> str:
        return f"{self.head}{self.content}{self.tail}"


def _capped_item(name: str, head: str, content: str, tail: str = "") -> _Item:
    if len(content) <= MAX_FILE_CHARS:
        return _Item(name, head, content, tail, source_chars=len(content))
    return _Item(name, head, _cut(content, MAX_FILE_CHARS), tail, source_chars=len(content), capped=True)


@dataclass(frozen=True, slots=True)
class _Section:
    key: str
    label: str
    head: str
    items: tuple[_Item, ...]
    noun: str
    separator: str = _FILE_SEPARATOR
    tail: str = ""
    skipped: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class SectionSize:
    """How much of one part of the prompt went in, and what was cut, left out or skipped."""

    key: str
    label: str
    chars: int
    source_chars: int
    items: int
    included: int
    truncated: tuple[str, ...] = ()
    omitted: tuple[str, ...] = ()
    skipped: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ComposedPrompt:
    text: str
    sections: tuple[SectionSize, ...]
    budget_chars: int

    @property
    def total_chars(self) -> int:
        return len(self.text)


@dataclass(frozen=True, slots=True)
class PreviousComments:
    """The comments an earlier iteration kept, shown so the model does not report them again."""

    iteration_number: int
    comments: tuple[Comment, ...]


@dataclass(frozen=True, slots=True)
class PromptInputs:
    # The review intent; ``None`` uses the built-in preset's instructions.
    intent: str | None = None
    diff_files: Sequence[DiffFile] = ()
    title: str = ""
    description: str = ""
    context: GatheredContext = field(default_factory=GatheredContext)
    previous: PreviousComments | None = None


def _omission_note(noun: str, omitted: Sequence[str]) -> str:
    if not omitted:
        return ""
    plural = noun if len(omitted) == 1 else f"{noun}s"
    lead = f"\n\n[Left out to fit the prompt budget: {len(omitted)} more {plural}"
    names: list[str] = []
    budget = _NOTE_RESERVE - len(lead) - 40
    for name in omitted:
        if len(name) + 2 > budget:
            break
        names.append(name)
        budget -= len(name) + 2
    listed = ", ".join(names)
    rest = len(omitted) - len(names)
    more = f" and {rest} more" if rest and names else ""
    return f"{lead}{': ' + listed if names else ''}{more}]"


def _fit(section: _Section, room: int) -> tuple[str, SectionSize]:
    """The section's text within ``room`` characters, and what of it went in."""
    names = [item.name for item in section.items]
    source = sum(item.source_chars for item in section.items)
    capped = [item.name for item in section.items if item.capped]
    whole = section.head + section.separator.join(item.render() for item in section.items) + section.tail
    if section.items and len(whole) <= room:
        size = SectionSize(
            section.key, section.label, len(whole), source, len(names), len(names), tuple(capped), (), section.skipped
        )
        return whole, size

    available = room - len(section.head) - len(section.tail) - _NOTE_RESERVE
    parts: list[str] = []
    truncated = list(capped)
    for item in section.items:
        separator = len(section.separator) if parts else 0
        rendered = item.render()
        if separator + len(rendered) <= available:
            parts.append(rendered)
            available -= separator + len(rendered)
            continue
        content_room = available - separator - len(item.head) - len(item.tail)
        if content_room >= _MIN_PARTIAL_CHARS:
            parts.append(item.head + _cut(item.content, content_room) + item.tail)
            if item.name not in truncated:
                truncated.append(item.name)
        break

    omitted = tuple(names[len(parts) :])
    if not parts:
        return "", SectionSize(section.key, section.label, 0, source, len(names), 0, (), omitted, section.skipped)
    text = section.head + section.separator.join(parts) + section.tail + _omission_note(section.noun, omitted)
    included = len(parts)
    kept_truncated = tuple(name for name in truncated if name in names[:included])
    return text, SectionSize(
        section.key, section.label, len(text), source, len(names), included, kept_truncated, omitted, section.skipped
    )


# ── diff ──────────────────────────────────────────────────────────────────────


def _hunk_header(hunk: DiffHunk) -> str:
    """The ``@@`` line with counts of the lines that follow it — not the counts the host sent: a
    reader of this text trusts them to know where the hunk ends, and a patch cut short by the
    host would otherwise pull the next file's header into this hunk."""
    old_count = sum(line.type != "added" for line in hunk.lines)
    new_count = sum(line.type != "removed" for line in hunk.lines)
    return f"@@ -{hunk.old_start},{old_count} +{hunk.new_start},{new_count} @@"


def format_diff_file(diff_file: DiffFile, *, annotate_lines: bool = False) -> str:
    """One file of a unified diff. With ``annotate_lines`` every line reads
    ``<marker><new-file line number> | <code>``; removed lines have no number."""
    old = diff_file.old_path or diff_file.path
    lines = [f"--- a/{old}", f"+++ b/{diff_file.path}"]
    width = max(
        (len(str(line.new_line)) for hunk in diff_file.hunks for line in hunk.lines if line.new_line is not None),
        default=1,
    )
    for hunk in diff_file.hunks:
        lines.append(_hunk_header(hunk))
        for line in hunk.lines:
            prefix = _DIFF_PREFIX[line.type]
            if not annotate_lines:
                lines.append(f"{prefix}{line.content}")
                continue
            number = "" if line.type == "removed" or line.new_line is None else str(line.new_line)
            lines.append(f"{prefix}{number:>{width}} | {line.content}")
    return "\n".join(lines)


def format_diff(diff_files: Sequence[DiffFile], *, annotate_lines: bool = False) -> str:
    return "\n".join(format_diff_file(df, annotate_lines=annotate_lines) for df in diff_files)


_LINE_KEY_EXPLAINER: Final = (
    "Each diff line reads `<marker><line> | <code>`: the marker is `+` for an added line, a space for an "
    "unchanged one and `-` for a removed one; `<line>` is the line number in the new version of the file "
    "(removed lines have none)."
)


def _diff_section(config: BriefConfig, diff_files: Sequence[DiffFile]) -> _Section:
    texts = [format_diff_file(df, annotate_lines=config.annotate_line_numbers) for df in diff_files]
    fence = _fence(*texts)
    explainer = f"{_LINE_KEY_EXPLAINER}\n\n" if config.annotate_line_numbers else ""
    items = tuple(_Item(df.path, "", text, source_chars=len(text)) for df, text in zip(diff_files, texts, strict=True))
    return _Section(
        "diff",
        "Diff",
        f"## Diff\n\n{explainer}{fence}diff\n",
        items,
        "changed file",
        separator="\n",
        tail=f"\n{fence}",
    )


# ── other sections ────────────────────────────────────────────────────────────


def _readable(files: Mapping[str, str]) -> tuple[list[tuple[str, str]], tuple[str, ...]]:
    readable = [(path, content) for path, content in files.items() if not looks_binary(content)]
    skipped = tuple(path for path, content in files.items() if looks_binary(content))
    return readable, skipped


def _code_section(key: str, label: str, heading: str, files: Mapping[str, str]) -> _Section:
    readable, skipped = _readable(files)
    items = []
    for path, content in readable:
        fence = _fence(content)
        items.append(_capped_item(path, f"### {path}\n\n{fence}\n", content, f"\n{fence}"))
    return _Section(key, label, f"## {heading}\n\n", tuple(items), "file", skipped=skipped)


def _context_section(files: Mapping[str, str]) -> _Section:
    readable, skipped = _readable(files)
    items = tuple(_capped_item(path, f"### {path}\n\n", content) for path, content in readable)
    return _Section("context_files", "Project context", "## Project Context\n\n", items, "file", skipped=skipped)


def _description_section(title: str, description: str) -> _Section:
    body = description or "(none)"
    head = f"## MR Title\n\n{title}\n\n## MR Description\n\n"
    item = _Item("description", head, body, source_chars=len(head) + len(body))
    return _Section("description", "MR description", "", (item,), "description")


def _comment_line(comment: Comment) -> tuple[str, str]:
    anchor = comment.file or "general"
    if comment.file and comment.line:
        anchor = f"{comment.file}:{comment.line}"
    body = " ".join(comment.body.split())
    if len(body) > _PREVIOUS_BODY_CHARS:
        body = body[: _PREVIOUS_BODY_CHARS - 1].rstrip() + "…"
    resolved = " (marked resolved)" if comment.resolved else ""
    return anchor, f"- [{comment.severity}] `{anchor}`{resolved} — {body}"


def _previous_section(previous: PreviousComments) -> _Section:
    head = (
        f"## Already Reported (iteration {previous.iteration_number})\n\n"
        "These comments were made in the previous review iteration. Do not repeat them. Raise one again "
        "only if the problem is still present in the diff below, and then say that it is still unresolved.\n\n"
    )
    items = []
    for comment in previous.comments:
        anchor, line = _comment_line(comment)
        items.append(_Item(anchor, "", line, source_chars=len(line)))
    return _Section("previous_comments", "Previous comments", head, tuple(items), "comment", separator="\n")


def _history_section(history: Mapping[str, list[dict[str, str]]]) -> _Section:
    items = []
    for path, commits in history.items():
        lines = "\n".join(
            f"- `{c.get('id', '')}` {c.get('date', '')[:10]} **{c.get('author', '')}**: {c.get('title', '')}"
            for c in commits
        )
        items.append(_Item(path, f"### {path}\n", lines, source_chars=len(lines)))
    return _Section("commit_history", "Commit history", "## Commit History\n\n", tuple(items), "file", separator="\n\n")


def _sections(config: BriefConfig, inputs: PromptInputs) -> dict[str, _Section]:
    """The sections the brief turns on and has material for, built lazily."""
    context = inputs.context
    previous = inputs.previous or PreviousComments(iteration_number=0, comments=())
    builders: dict[str, tuple[bool, Callable[[], _Section]]] = {
        "diff": (config.include_diff, lambda: _diff_section(config, inputs.diff_files)),
        "description": (config.include_description, lambda: _description_section(inputs.title, inputs.description)),
        "previous_comments": (bool(previous.comments), lambda: _previous_section(previous)),
        "context_files": (
            config.include_context and bool(context.context_files),
            lambda: _context_section(context.context_files),
        ),
        "full_files": (
            config.include_full_files and bool(context.full_files),
            lambda: _code_section("full_files", "Full files", "Changed Files (Full Content)", context.full_files),
        ),
        "test_files": (
            config.include_test_context and bool(context.test_files),
            lambda: _code_section("test_files", "Test context", "Test Context", context.test_files),
        ),
        "related_code": (
            config.include_related_code and bool(context.related_code),
            lambda: _code_section("related_code", "Related code", "Related Code", context.related_code),
        ),
        "commit_history": (
            config.include_commit_history and bool(context.commit_history),
            lambda: _history_section(context.commit_history),
        ),
    }
    return {key: build() for key, (enabled, build) in builders.items() if enabled}


# Which material gets the budget first.
_PRIORITY: Final = (
    "diff",
    "description",
    "previous_comments",
    "context_files",
    "full_files",
    "test_files",
    "related_code",
    "commit_history",
)
# Where each part sits in the prompt.
_LAYOUT: Final = (
    "context_files",
    "description",
    "previous_comments",
    "diff",
    "full_files",
    "test_files",
    "related_code",
    "commit_history",
)


# ── instructions ──────────────────────────────────────────────────────────────


def _task(config: BriefConfig, intent: str) -> str:
    parts = [f"# Code Review Task\n\n{intent}"]
    if config.custom_instructions.strip():
        parts.append(f"## Additional Instructions\n\n{config.custom_instructions.strip()}")
    if config.focus_areas:
        checklist = "\n".join(f"- {area}" for area in config.focus_areas)
        parts.append(f"## Focus Areas\n\nCheck each of these explicitly:\n{checklist}")
    return _SECTION_JOIN.join(parts)


_OUTPUT_EXAMPLE: Final = """Example of a valid response:
[
  {"file": "src/auth/login.py", "line": 42, "severity": "critical",
   "body": "SQL injection risk: concatenated user input. Use parameterised queries."},
  {"file": "src/utils.py", "line": null, "severity": "minor", "body": "This module has no unit tests."},
  {"file": null, "line": null, "severity": "suggestion", "body": "Consider adding a changelog entry for this MR."}
]"""


def _output_format(config: BriefConfig) -> str:
    line_doc = (
        "the line's number from the diff (`<line>` in `<marker><line> | <code>`); null if the comment is not "
        "line-specific"
        if config.annotate_line_numbers
        else "line number in the new version of the file; null if the comment is not line-specific"
    )
    rules = [
        "Output ONLY the JSON array — nothing before `[` or after `]`",
        "Do NOT wrap the output in markdown code fences (no ```json or ```)",
        "Every object MUST have all four fields",
        '"severity" MUST be one of: critical, major, minor, suggestion',
        '"body" MUST be non-empty',
    ]
    if config.annotate_line_numbers:
        rules.append(
            '"line" MUST be one of the line numbers shown in the diff for that file; removed (`-`) lines have no '
            'number — anchor such a comment to the nearest numbered line or set "line" to null'
        )
    if config.output_language:
        rules.append(
            f'Write every "body" in {config.output_language}; keep code, identifiers, file paths and quoted '
            "messages as they are"
        )
    if config.min_severity != "suggestion":
        allowed = ", ".join(severities_at_least(config.min_severity))
        rules.append(f"Report only issues of severity {allowed}; leave out anything less important")
    if config.max_comments is not None:
        rules.append(f"Return at most {config.max_comments} comments; if you find more, keep the most severe ones")
    rule_lines = "\n".join(f"- {rule}" for rule in rules)
    return (
        "## Output Format\n\n"
        "You MUST respond with ONLY a valid JSON array. No explanation, no markdown, no code fences.\n"
        "Start your response with `[` and end it with `]`.\n\n"
        "Each element in the array is an object with exactly these fields:\n"
        '- "file": string or null — relative path to the file being commented on; null for general MR-level '
        "comments\n"
        f'- "line": integer or null — {line_doc}\n'
        '- "severity": one of exactly: "critical", "major", "minor", "suggestion"\n'
        '- "body": string — the review comment written in Markdown\n\n'
        f"{_OUTPUT_EXAMPLE}\n\n"
        f"Rules:\n{rule_lines}"
    )


def _instructions_size(task: str, full_task: str, output: str) -> SectionSize:
    truncated = ("instructions",) if len(task) < len(full_task) else ()
    return SectionSize(
        "instructions",
        "Instructions",
        len(task) + len(_SECTION_JOIN) + len(output),
        len(full_task) + len(_SECTION_JOIN) + len(output),
        1,
        1,
        truncated,
    )


def compose_prompt(config: BriefConfig, inputs: PromptInputs) -> ComposedPrompt:
    """The prompt for ``config`` over ``inputs``, cut to the brief's budget, with a size breakdown."""
    intent = inputs.intent or BUILTIN_PRESETS[config.preset].instructions
    budget = config.prompt_budget_chars
    full_task = _task(config, intent)
    # The task text — preset or saved instructions, additional instructions, focus areas — may
    # take only a share of the budget, so the diff always keeps most of it; what is cut goes
    # from the end (focus areas first, the review intent last).
    task_room = int(budget * _TASK_SHARE)
    task = full_task if len(full_task) <= task_room else _cut(full_task, task_room)
    output = _output_format(config)
    used = len(task) + len(_SECTION_JOIN) + len(output)

    sections = _sections(config, inputs)
    rendered: dict[str, str] = {}
    sizes: list[SectionSize] = [_instructions_size(task, full_task, output)]
    for key in _PRIORITY:
        section = sections.get(key)
        if section is None:
            continue
        text, size = _fit(section, max(0, budget - used - len(_SECTION_JOIN)))
        sizes.append(size)
        if text:
            rendered[key] = text
            used += len(_SECTION_JOIN) + len(text)

    parts = [task, *(rendered[key] for key in _LAYOUT if key in rendered), output]
    return ComposedPrompt(text=_SECTION_JOIN.join(parts), sections=tuple(sizes), budget_chars=budget)
