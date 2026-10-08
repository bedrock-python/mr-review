"""The prompt text: line-number annotation, the brief's new instructions and the size budget."""

from __future__ import annotations

import pytest
from mr_review.core.mrs.entities import DiffFile, DiffHunk, DiffLine
from mr_review.core.reviews.entities import MIN_PROMPT_BUDGET_CHARS, BriefConfig
from mr_review.infra.vcs._diff_parser import diff_file_from_patch
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


def test__budget__huge_instructions_cut_so_the_diff_still_fits() -> None:
    config = BriefConfig(prompt_budget_chars=MIN_PROMPT_BUDGET_CHARS, custom_instructions="z" * 25_000)

    prompt = _compose(config, diff_files=[_numbered_file()])

    assert prompt.total_chars <= MIN_PROMPT_BUDGET_CHARS
    assert prompt.text.startswith("# Code Review Task\n\nPerform a thorough code review.")
    assert "… [cut:" in prompt.text
    assert _section(prompt, "instructions").truncated == ("instructions",)
    assert _section(prompt, "diff").included == 1
    assert "+11 |     return compute()" in prompt.text
    assert "## Output Format" in prompt.text


@pytest.mark.parametrize(
    "fields",
    [
        {"custom_instructions": "c" * 3_000, "focus_areas": [f"{i} " + "f" * 150 for i in range(30)]},
        {"custom_instructions": "c" * 30_000},
    ],
)
def test__budget__diff_keeps_most_of_a_small_budget_whatever_the_instructions(fields: dict[str, object]) -> None:
    config = BriefConfig.model_validate({"prompt_budget_chars": MIN_PROMPT_BUDGET_CHARS, **fields})
    files = [_big_file(f"src/m{i}.py", 60) for i in range(8)]

    prompt = _compose(config, diff_files=files, intent="Review the API." * 2_000)

    assert prompt.total_chars <= MIN_PROMPT_BUDGET_CHARS
    assert _section(prompt, "diff").chars >= MIN_PROMPT_BUDGET_CHARS // 2


def test__hunk_header__counts_the_lines_actually_written() -> None:
    """A host may send a hunk shorter than its header claims; the header must not promise lines
    that are not there, or the next file's header is read as part of this hunk."""
    short = DiffHunk(
        old_start=1,
        old_count=40,
        new_start=1,
        new_count=42,
        lines=[
            DiffLine(type="context", old_line=1, new_line=1, content="a"),
            DiffLine(type="removed", old_line=2, content="b"),
            DiffLine(type="added", new_line=2, content="c"),
            DiffLine(type="added", new_line=3, content="d"),
        ],
    )
    files = [DiffFile(path="a.py", additions=2, deletions=1, hunks=[short]), _numbered_file("b.py")]

    lines = format_diff(files).splitlines()

    assert lines[2] == "@@ -1,2 +1,3 @@"
    assert lines[3:7] == [" a", "-b", "+c", "+d"]
    assert lines[7] == "--- a/b.py"


def test__annotation__no_newline_marker_does_not_shift_line_numbers() -> None:
    patch = (
        "@@ -1,2 +1,3 @@\n first\n-second\n\\ No newline at end of file\n+second\n+third\n"
        "\\ No newline at end of file\n"
    )
    diff_file = diff_file_from_patch("a.txt", None, patch)

    lines = format_diff_file(diff_file, annotate_lines=True).splitlines()

    assert lines[3:] == [" 1 | first", "-  | second", "+2 | second", "+3 | third"]


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


def _as_host_decodes(source: str, encoding: str) -> str:
    """What a host returns for a file stored in ``encoding``: its bytes read as UTF-8."""
    return source.encode(encoding).decode("utf-8", errors="replace")


@pytest.mark.parametrize(
    ("source", "encoding"),
    [
        (
            "// Prüfe die Größe der Übergabe; Fehler früh melden\n"
            + "public int size(List<String> items) { return items.size(); }\n" * 3,
            "cp1252",
        ),
        ("# Проверка размера\n" + "def size(items):\n    return len(items)\n" * 4, "cp1251"),
    ],
)
def test__looks_binary__legacy_encoded_source_is_still_text(source: str, encoding: str) -> None:
    text = _as_host_decodes(source * 30, encoding)

    assert "�" in text
    assert looks_binary(text) is False


def test__looks_binary__undecodable_bytes_are_binary() -> None:
    noise = bytes((i * 151 + 7) % 128 + 128 for i in range(4_000)).decode("utf-8", errors="replace")

    assert looks_binary(noise) is True


def test__code_fence__longer_than_backticks_inside_the_file() -> None:
    config = BriefConfig(include_full_files=True)
    readme = "Example:\n```python\nprint(1)\n```\n"

    prompt = _compose(config, context=GatheredContext(full_files={"docs/README.md": readme})).text

    assert f"### docs/README.md\n\n````\n{readme}\n````" in prompt
