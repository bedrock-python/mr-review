"""The prompt text: line-number annotation, the brief's new instructions and the size budget."""

from __future__ import annotations

import pytest
from mr_review.core.mrs.entities import DiffFile, DiffHunk, DiffLine
from mr_review.core.reviews.entities import MIN_PROMPT_BUDGET_CHARS, BriefConfig
from mr_review.use_cases.reviews.context_files import GatheredContext
from mr_review.use_cases.reviews.prompt_builder import (
    MAX_FILE_CHARS,
    ComposedPrompt,
    PreviousComments,
    PromptInputs,
    SectionSize,
    compose_prompt,
    format_diff,
    format_diff_file,
    looks_binary,
)

from tests.factories.entities import make_comment

pytestmark = pytest.mark.unit


def _numbered_file(path: str = "src/app.py") -> DiffFile:
    """Lines 10-12 of the new file around one replaced line."""
    hunk = DiffHunk(
        old_start=10,
        old_count=3,
        new_start=10,
        new_count=3,
        lines=[
            DiffLine(type="context", old_line=10, new_line=10, content="def handler():"),
            DiffLine(type="removed", old_line=11, content="    return None"),
            DiffLine(type="added", new_line=11, content="    return compute()"),
            DiffLine(type="context", old_line=12, new_line=12, content=""),
        ],
    )
    return DiffFile(path=path, additions=1, deletions=1, hunks=[hunk])


def _big_file(path: str, lines: int, width: int = 80) -> DiffFile:
    """A new file of ``lines`` added lines, each ``width`` characters wide."""
    body = [DiffLine(type="added", new_line=i + 1, content=f"{i:06d}".ljust(width, "x")) for i in range(lines)]
    hunk = DiffHunk(old_start=0, old_count=0, new_start=1, new_count=lines, lines=body)
    return DiffFile(path=path, additions=lines, deletions=0, hunks=[hunk])


def _compose(config: BriefConfig | None = None, **inputs: object) -> ComposedPrompt:
    return compose_prompt(config or BriefConfig(), PromptInputs(**inputs))  # type: ignore[arg-type]


def _section(prompt: ComposedPrompt, key: str) -> SectionSize:
    return next(s for s in prompt.sections if s.key == key)


# ── line-number annotation ────────────────────────────────────────────────────


def test__format_diff_file__annotated__every_new_file_line_carries_its_number() -> None:
    text = format_diff_file(_numbered_file(), annotate_lines=True)

    assert text.splitlines() == [
        "--- a/src/app.py",
        "+++ b/src/app.py",
        "@@ -10,3 +10,3 @@",
        " 10 | def handler():",
        "-   |     return None",
        "+11 |     return compute()",
        " 12 | ",
    ]


def test__format_diff__default__plain_unified_diff_for_the_diff_endpoint() -> None:
    text = format_diff([_numbered_file()])

    assert "+    return compute()" in text.splitlines()
    assert " | " not in text


def test__prompt__default_brief__diff_lines_numbered_and_line_tied_to_those_numbers() -> None:
    prompt = _compose(diff_files=[_numbered_file()]).text

    assert "+11 |     return compute()" in prompt
    assert '"line" MUST be one of the line numbers shown in the diff' in prompt


def test__prompt__annotation_off__raw_diff_and_no_line_number_rule() -> None:
    prompt = _compose(BriefConfig(annotate_line_numbers=False), diff_files=[_numbered_file()]).text

    assert "\n+    return compute()\n" in prompt
    assert "MUST be one of the line numbers" not in prompt


# ── what the model is asked ───────────────────────────────────────────────────


def test__prompt__default_brief__no_language_severity_or_count_rules() -> None:
    prompt = _compose(diff_files=[_numbered_file()]).text

    assert "Write every" not in prompt
    assert "Report only issues" not in prompt
    assert "at most" not in prompt


def test__prompt__output_language__bodies_asked_in_that_language() -> None:
    prompt = _compose(BriefConfig(output_language="Russian")).text

    assert 'Write every "body" in Russian' in prompt


def test__prompt__min_severity_and_cap__both_told_to_the_model() -> None:
    prompt = _compose(BriefConfig(min_severity="major", max_comments=5)).text

    assert "Report only issues of severity critical, major" in prompt
    assert "Return at most 5 comments" in prompt


def test__prompt__focus_areas__listed_as_a_checklist_after_the_instructions() -> None:
    prompt = _compose(BriefConfig(focus_areas=["error handling", "SQL migrations"])).text

    assert "## Focus Areas\n\nCheck each of these explicitly:\n- error handling\n- SQL migrations" in prompt
    assert prompt.index("## Focus Areas") < prompt.index("## Output Format")


def test__prompt__custom_intent__replaces_the_builtin_preset_text() -> None:
    prompt = _compose(intent="Only look at the public API surface.").text

    assert prompt.startswith("# Code Review Task\n\nOnly look at the public API surface.")
    assert "Perform a thorough code review" not in prompt


def test__prompt__previous_comments__listed_as_already_reported() -> None:
    previous = PreviousComments(
        iteration_number=1,
        comments=(
            make_comment(file="src/a.py", line=7, severity="major", body="Missing\nnull check"),
            make_comment(file=None, line=None, severity="suggestion", body="Add a changelog entry").model_copy(
                update={"resolved": True}
            ),
        ),
    )

    prompt = _compose(diff_files=[_numbered_file()], previous=previous).text

    assert "## Already Reported (iteration 1)" in prompt
    assert "- [major] `src/a.py:7` — Missing null check" in prompt
    assert "- [suggestion] `general` (marked resolved) — Add a changelog entry" in prompt
    assert prompt.index("## Already Reported") < prompt.index("## Diff")


def test__prompt__long_previous_comment__body_shortened() -> None:
    previous = PreviousComments(iteration_number=2, comments=(make_comment(body="word " * 500),))

    prompt = _compose(previous=previous).text

    line = next(line for line in prompt.splitlines() if line.startswith("- [minor]"))
    assert len(line) < 500
    assert line.endswith("…")


# ── the size budget ───────────────────────────────────────────────────────────


def test__budget__material_over_budget__prompt_stays_within_it() -> None:
    config = BriefConfig(prompt_budget_chars=MIN_PROMPT_BUDGET_CHARS, include_full_files=True)
    full = {f"src/f{i}.py": "y" * 9_000 for i in range(10)}

    prompt = _compose(config, diff_files=[_big_file("src/a.py", 100)], context=GatheredContext(full_files=full))

    assert prompt.total_chars <= MIN_PROMPT_BUDGET_CHARS


def test__budget__diff_before_full_files__diff_whole_full_files_cut() -> None:
    config = BriefConfig(prompt_budget_chars=MIN_PROMPT_BUDGET_CHARS, include_full_files=True)
    full = {f"src/f{i}.py": "line\n" * 2_000 for i in range(5)}

    prompt = _compose(config, diff_files=[_big_file("src/a.py", 100)], context=GatheredContext(full_files=full))

    diff = _section(prompt, "diff")
    full_files = _section(prompt, "full_files")
    assert (diff.included, diff.omitted, diff.truncated) == (1, (), ())
    assert full_files.included < 5
    assert full_files.omitted == tuple(f"src/f{i}.py" for i in range(full_files.included, 5))
    assert "[Left out to fit the prompt budget:" in prompt.text


def test__budget__diff_alone_too_big__first_files_whole_next_cut_rest_named() -> None:
    config = BriefConfig(prompt_budget_chars=MIN_PROMPT_BUDGET_CHARS, annotate_line_numbers=False)
    files = [_big_file(f"src/m{i}.py", 60) for i in range(8)]  # about 5 000 characters each

    prompt = _compose(config, diff_files=files)

    diff = _section(prompt, "diff")
    cut = diff.included - 1
    assert 1 <= cut < 7
    assert diff.truncated == (f"src/m{cut}.py",)
    assert diff.omitted == tuple(f"src/m{i}.py" for i in range(cut + 1, 8))
    assert "… [cut:" in prompt.text
    named = ", ".join(diff.omitted)
    assert f"[Left out to fit the prompt budget: {len(diff.omitted)} more changed files: {named}]" in prompt.text
    assert prompt.total_chars <= MIN_PROMPT_BUDGET_CHARS


def test__budget__lower_priority_section_uses_the_room_left() -> None:
    config = BriefConfig(prompt_budget_chars=MIN_PROMPT_BUDGET_CHARS, include_commit_history=True)
    history = {"src/a.py": [{"id": "abc1234", "date": "2026-01-01T00:00:00Z", "author": "dev", "title": "Fix"}]}

    prompt = _compose(config, diff_files=[_numbered_file()], context=GatheredContext(commit_history=history))

    assert _section(prompt, "commit_history").included == 1
    assert "`abc1234` 2026-01-01 **dev**: Fix" in prompt.text


def test__budget__instructions_always_whole() -> None:
    config = BriefConfig(prompt_budget_chars=MIN_PROMPT_BUDGET_CHARS, custom_instructions="z" * 25_000)

    prompt = _compose(config, diff_files=[_numbered_file()])

    assert "z" * 25_000 in prompt.text
    assert _section(prompt, "diff").included == 0
    assert "## Output Format" in prompt.text


def test__budget__breakdown_lists_sections_in_priority_order_with_sizes() -> None:
    config = BriefConfig(include_full_files=True)
    prompt = _compose(
        config,
        diff_files=[_numbered_file()],
        title="T",
        description="D",
        context=GatheredContext(context_files={"README.md": "readme"}, full_files={"src/app.py": "code"}),
    )

    assert [s.key for s in prompt.sections] == ["instructions", "diff", "description", "context_files", "full_files"]
    assert sum(s.chars for s in prompt.sections) <= prompt.total_chars
    assert all(s.included == s.items for s in prompt.sections)


def test__file_cap__long_file_cut_with_a_marker_and_reported() -> None:
    config = BriefConfig(include_full_files=True)
    content = "line\n" * (MAX_FILE_CHARS // 5 + 1_000)

    prompt = _compose(config, context=GatheredContext(full_files={"src/huge.py": content}))

    full_files = _section(prompt, "full_files")
    assert full_files.truncated == ("src/huge.py",)
    assert full_files.source_chars == len(content)
    assert f"of {len(content):,} characters shown]" in prompt.text


def test__binary_content__skipped_and_reported() -> None:
    config = BriefConfig(include_full_files=True, include_context=True)
    binary = "PNG\x00\x01\x02" + "�" * 50

    prompt = _compose(
        config,
        context=GatheredContext(
            context_files={"docs/logo.md": "�" * 100}, full_files={"img/logo.png": binary, "src/a.py": "code"}
        ),
    )

    assert _section(prompt, "full_files").skipped == ("img/logo.png",)
    assert _section(prompt, "context_files").skipped == ("docs/logo.md",)
    assert "PNG\x00" not in prompt.text
    assert "### src/a.py" in prompt.text


@pytest.mark.parametrize(
    ("content", "binary"),
    [("plain text", False), ("café � once", False), ("a\x00b", True), ("�" * 10, True)],
)
def test__looks_binary(content: str, binary: bool) -> None:
    assert looks_binary(content) is binary


def test__code_fence__longer_than_backticks_inside_the_file() -> None:
    config = BriefConfig(include_full_files=True)
    readme = "Example:\n```python\nprint(1)\n```\n"

    prompt = _compose(config, context=GatheredContext(full_files={"docs/README.md": readme})).text

    assert f"### docs/README.md\n\n````\n{readme}\n````" in prompt
