"""Unit tests for dispatch_review helpers (prompt builder, diff formatter, AI response parser)."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from mr_review.core.mrs.entities import DiffFile, DiffHunk, DiffLine
from mr_review.core.reviews.entities import BriefConfig, BriefPreset, IterationStage, Review
from mr_review.use_cases.reviews.dispatch_review import DispatchReviewUseCase
from mr_review.use_cases.reviews.prompt_builder import build_prompt as _build_prompt
from mr_review.use_cases.reviews.prompt_builder import format_diff as _format_diff

from tests.factories.entities import make_iteration, make_review

pytestmark = pytest.mark.unit


# ── _format_diff ──────────────────────────────────────────────────────────────


def _make_diff_file(path: str = "src/foo.py", *, hunks: list[DiffHunk] | None = None) -> DiffFile:
    return DiffFile(
        path=path,
        old_path=None,
        additions=0,
        deletions=0,
        hunks=hunks or [],
    )


def _make_hunk(added: list[str] | None = None, removed: list[str] | None = None) -> DiffHunk:
    lines: list[DiffLine] = []
    for content in removed or []:
        lines.append(DiffLine(type="removed", content=content))
    for content in added or []:
        lines.append(DiffLine(type="added", content=content))
    return DiffHunk(
        old_start=1,
        old_count=len(removed or []),
        new_start=1,
        new_count=len(added or []),
        lines=lines,
    )


def test__format_diff__empty_list__returns_empty_string() -> None:
    assert _format_diff([]) == ""


def test__format_diff__single_file_with_hunk__includes_header_and_diff_lines() -> None:
    hunk = _make_hunk(removed=["old line"], added=["new line"])
    diff = _format_diff([_make_diff_file("src/foo.py", hunks=[hunk])])

    assert "--- a/src/foo.py" in diff
    assert "+++ b/src/foo.py" in diff
    assert "-old line" in diff
    assert "+new line" in diff


def test__format_diff__file_with_old_path__uses_old_path_in_header() -> None:
    hunk = _make_hunk(added=["x"])
    df = DiffFile(path="src/new.py", old_path="src/old.py", additions=1, deletions=0, hunks=[hunk])
    diff = _format_diff([df])

    assert "--- a/src/old.py" in diff
    assert "+++ b/src/new.py" in diff


def test__format_diff__context_line__uses_space_prefix() -> None:
    hunk = DiffHunk(
        old_start=1,
        old_count=1,
        new_start=1,
        new_count=1,
        lines=[DiffLine(type="context", content="unchanged")],
    )
    diff = _format_diff([_make_diff_file(hunks=[hunk])])

    assert " unchanged" in diff


# ── _build_prompt ─────────────────────────────────────────────────────────────


def test__build_prompt__includes_preset_instructions() -> None:
    review = make_review(brief_config=BriefConfig(preset=BriefPreset.security))
    prompt = _build_prompt(review.brief_config, diff_text="diff", mr_title="T", mr_description="D")

    assert "security" in prompt.lower()


def test__build_prompt__custom_instructions__included_in_prompt() -> None:
    config = BriefConfig(custom_instructions="Check performance", preset=BriefPreset.thorough)
    review = make_review(brief_config=config)
    prompt = _build_prompt(review.brief_config, diff_text="diff", mr_title="T", mr_description="D")

    assert "Check performance" in prompt


def test__build_prompt__no_custom_instructions__no_additional_section() -> None:
    review = make_review(brief_config=BriefConfig(custom_instructions="", preset=BriefPreset.thorough))
    prompt = _build_prompt(review.brief_config, diff_text="diff", mr_title="T", mr_description="D")

    assert "Additional Instructions" not in prompt


def test__build_prompt__include_description_true__mr_info_in_prompt() -> None:
    review = make_review(brief_config=BriefConfig(include_description=True))
    prompt = _build_prompt(
        review.brief_config, diff_text="diff", mr_title="Fix auth bug", mr_description="Details here"
    )

    assert "Fix auth bug" in prompt
    assert "Details here" in prompt


def test__build_prompt__include_description_false__mr_info_not_in_prompt() -> None:
    review = make_review(brief_config=BriefConfig(include_description=False))
    prompt = _build_prompt(
        review.brief_config, diff_text="diff", mr_title="Fix auth bug", mr_description="Details here"
    )

    assert "Fix auth bug" not in prompt


def test__build_prompt__include_diff_true__diff_in_prompt() -> None:
    review = make_review(brief_config=BriefConfig(include_diff=True))
    prompt = _build_prompt(review.brief_config, diff_text="- removed\n+ added", mr_title="T", mr_description="D")

    assert "- removed" in prompt
    assert "+ added" in prompt


def test__build_prompt__include_diff_false__diff_not_in_prompt() -> None:
    review = make_review(brief_config=BriefConfig(include_diff=False))
    prompt = _build_prompt(review.brief_config, diff_text="secret diff content", mr_title="T", mr_description="D")

    assert "secret diff content" not in prompt


def test__build_prompt__always_includes_output_schema() -> None:
    review = make_review()
    prompt = _build_prompt(review.brief_config, diff_text="diff", mr_title="T", mr_description="D")

    assert "severity" in prompt
    assert "JSON" in prompt


def test__build_prompt__context_contents__adds_project_context_section() -> None:
    review = make_review()
    context = {"CLAUDE.md": "# Rules\n\nUse snake_case.", ".cursor/rules/style.md": "Always add types."}
    prompt = _build_prompt(
        review.brief_config, diff_text="diff", mr_title="T", mr_description="D", context_contents=context
    )

    assert "## Project Context" in prompt
    assert "CLAUDE.md" in prompt
    assert "Use snake_case." in prompt
    assert ".cursor/rules/style.md" in prompt
    assert "Always add types." in prompt


def test__build_prompt__empty_context_contents__no_project_context_section() -> None:
    review = make_review()
    prompt = _build_prompt(review.brief_config, diff_text="diff", mr_title="T", mr_description="D", context_contents={})

    assert "## Project Context" not in prompt


def test__build_prompt__none_context_contents__no_project_context_section() -> None:
    review = make_review()
    prompt = _build_prompt(
        review.brief_config, diff_text="diff", mr_title="T", mr_description="D", context_contents=None
    )

    assert "## Project Context" not in prompt


def test__build_prompt__context_appears_before_diff() -> None:
    review = make_review(brief_config=BriefConfig(include_diff=True, include_description=False))
    context = {"README.md": "Project readme content."}
    prompt = _build_prompt(
        review.brief_config,
        diff_text="my_diff_marker",
        mr_title="T",
        mr_description="D",
        context_contents=context,
    )

    context_pos = prompt.index("Project readme content.")
    diff_pos = prompt.index("my_diff_marker")
    assert context_pos < diff_pos


# ── _persist_ai_response (via DispatchReviewUseCase) ──────────────────────────


async def test__persist_ai_response__valid_json__creates_comments_and_advances_stage() -> None:
    """_persist_ai_response parses valid JSON and saves comments + updates stage to polish."""
    review_repo = AsyncMock()
    iteration = make_iteration(stage=IterationStage.dispatch, comments=[])
    review = make_review(iterations=[iteration])
    review_repo.get_by_id.return_value = review

    use_case = DispatchReviewUseCase(review_repo, AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock())

    ai_response = json.dumps(
        [
            {"file": "src/foo.py", "line": 10, "severity": "minor", "body": "Consider renaming"},
            {"file": None, "line": None, "severity": "critical", "body": "Security issue"},
        ]
    )

    await use_case._persist_ai_response(review.id, iteration.id, ai_response)  # noqa: SLF001

    review_repo.update.assert_awaited_once()
    saved: Review = review_repo.update.call_args[0][0]
    updated_iter = saved.iterations[0]
    assert updated_iter.stage == IterationStage.polish
    assert len(updated_iter.comments) == 2
    assert updated_iter.comments[0].file == "src/foo.py"
    assert updated_iter.comments[0].line == 10
    assert updated_iter.comments[1].file is None


async def test__persist_ai_response__invalid_json__creates_single_raw_comment() -> None:
    """_persist_ai_response falls back to a single suggestion comment on invalid JSON."""
    review_repo = AsyncMock()
    iteration = make_iteration(stage=IterationStage.dispatch, comments=[])
    review = make_review(iterations=[iteration])
    review_repo.get_by_id.return_value = review

    use_case = DispatchReviewUseCase(review_repo, AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock())

    await use_case._persist_ai_response(review.id, iteration.id, "not valid json at all")  # noqa: SLF001

    saved: Review = review_repo.update.call_args[0][0]
    updated_iter = saved.iterations[0]
    assert len(updated_iter.comments) == 1
    assert updated_iter.comments[0].severity == "suggestion"
    assert "not valid json at all" in updated_iter.comments[0].body


async def test__persist_ai_response__unknown_severity__normalises_to_suggestion() -> None:
    """_persist_ai_response coerces unrecognised severity values to 'suggestion'."""
    review_repo = AsyncMock()
    iteration = make_iteration(stage=IterationStage.dispatch, comments=[])
    review = make_review(iterations=[iteration])
    review_repo.get_by_id.return_value = review

    use_case = DispatchReviewUseCase(review_repo, AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock())

    ai_response = json.dumps(
        [
            {"file": None, "line": None, "severity": "blocker", "body": "Something"},
        ]
    )
    await use_case._persist_ai_response(review.id, iteration.id, ai_response)  # noqa: SLF001

    saved: Review = review_repo.update.call_args[0][0]
    assert saved.iterations[0].comments[0].severity == "suggestion"


async def test__persist_ai_response__review_gone__no_error_raised() -> None:
    """_persist_ai_response is a no-op when the review no longer exists."""
    review_repo = AsyncMock()
    review_repo.get_by_id.return_value = None

    use_case = DispatchReviewUseCase(review_repo, AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock())
    await use_case._persist_ai_response(uuid4(), uuid4(), "[]")  # noqa: SLF001

    review_repo.update.assert_not_awaited()
