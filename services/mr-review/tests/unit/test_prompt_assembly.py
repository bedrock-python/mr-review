"""From a review and its brief to the prompt: path filters, saved presets and previous comments."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from mr_review.core.mrs.entities import MR, DiffFile, DiffHunk, DiffLine
from mr_review.core.review_presets.entities import ReviewPreset
from mr_review.core.reviews.entities import BriefConfig, IterationStage
from mr_review.use_cases.reviews.prompt_assembly import (
    assemble_prompt,
    dispatch_target_number,
    previous_comments,
)

from tests.factories.entities import make_comment, make_iteration, make_review

pytestmark = pytest.mark.unit

_NOW = datetime.now(timezone.utc)


def _changed(path: str, content: str = "x = 1") -> DiffFile:
    hunk = DiffHunk(
        old_start=0, old_count=0, new_start=1, new_count=1, lines=[DiffLine(type="added", new_line=1, content=content)]
    )
    return DiffFile(path=path, additions=1, deletions=0, hunks=[hunk])


def _vcs(diff: list[DiffFile], files: dict[str, str] | None = None) -> AsyncMock:
    known = files or {}
    provider = AsyncMock()
    provider.get_mr.return_value = MR(
        iid=1,
        title="Add billing",
        description="Adds billing",
        author="dev",
        source_branch="feature",
        target_branch="main",
        status="opened",
        draft=False,
        created_at=_NOW,
        updated_at=_NOW,
        head_sha="abc123",
    )
    provider.get_diff.return_value = diff

    async def get_file(_repo: str, path: str, _ref: str = "HEAD") -> str | None:
        return known.get(path)

    provider.get_file.side_effect = get_file
    provider.list_directory.return_value = []
    return provider


def _preset(**fields: object) -> ReviewPreset:
    return ReviewPreset.model_validate(
        {"id": uuid4(), "name": "API", "instructions": "", "created_at": _NOW, "updated_at": _NOW, **fields}
    )


async def test__assemble__excluded_files_left_out_of_the_diff_and_of_full_files() -> None:
    diff = [_changed("src/billing.py", "charge()"), _changed("uv.lock", "lock-marker"), _changed("dist/app.js")]
    provider = _vcs(diff, files={"src/billing.py": "full billing", "uv.lock": "full lock", "dist/app.js": "bundle"})
    config = BriefConfig(include_context=False, include_full_files=True)

    assembled = await assemble_prompt(make_review(), provider, config, iteration_number=1)

    assert "charge()" in assembled.prompt.text
    assert "lock-marker" not in assembled.prompt.text
    assert "full lock" not in assembled.prompt.text
    assert "full billing" in assembled.prompt.text
    assert assembled.files_total == 3
    assert [(e.path, e.reason) for e in assembled.excluded] == [("uv.lock", "*.lock"), ("dist/app.js", "dist/")]
    assert [c.args[1] for c in provider.get_file.await_args_list] == ["src/billing.py"]


async def test__assemble__default_excludes_off__lockfile_reviewed() -> None:
    provider = _vcs([_changed("uv.lock", "lock-marker")])
    config = BriefConfig(include_context=False, use_default_excludes=False)

    assembled = await assemble_prompt(make_review(), provider, config, iteration_number=1)

    assert "lock-marker" in assembled.prompt.text
    assert assembled.excluded == ()


async def test__assemble__saved_preset__its_instructions_lead_the_prompt() -> None:
    preset = _preset(name="API surface", instructions="Review only the public API.")
    presets = AsyncMock()
    presets.get_by_id.return_value = preset
    config = BriefConfig(include_context=False, custom_preset_id=preset.id)

    assembled = await assemble_prompt(make_review(), _vcs([]), config, iteration_number=1, presets=presets)

    assert assembled.prompt.text.startswith("# Code Review Task\n\nReview only the public API.")
    assert (assembled.intent.preset_name, assembled.intent.preset_missing) == ("API surface", False)


async def test__assemble__saved_preset_without_instructions__builtin_text_kept() -> None:
    preset = _preset(instructions="  ")
    presets = AsyncMock()
    presets.get_by_id.return_value = preset
    config = BriefConfig(include_context=False, preset="security", custom_preset_id=preset.id)

    assembled = await assemble_prompt(make_review(), _vcs([]), config, iteration_number=1, presets=presets)

    assert "Focus on security issues" in assembled.prompt.text


async def test__assemble__saved_preset_deleted__builtin_stands_in_and_it_is_reported() -> None:
    presets = AsyncMock()
    presets.get_by_id.return_value = None
    config = BriefConfig(include_context=False, preset="performance", custom_preset_id=uuid4())

    assembled = await assemble_prompt(make_review(), _vcs([]), config, iteration_number=1, presets=presets)

    assert "Focus on performance" in assembled.prompt.text
    assert assembled.intent.preset_missing is True


async def test__assemble__second_iteration__first_iterations_kept_comments_shown() -> None:
    first = make_iteration(
        number=1,
        stage=IterationStage.post,
        comments=[
            make_comment(body="Reported and kept"),
            make_comment(body="Dismissed one").model_copy(update={"status": "dismissed"}),
        ],
    )
    review = make_review(iterations=[first])
    config = BriefConfig(include_context=False)

    assembled = await assemble_prompt(review, _vcs([_changed("a.py")]), config, iteration_number=2)

    assert "## Already Reported (iteration 1)" in assembled.prompt.text
    assert "Reported and kept" in assembled.prompt.text
    assert "Dismissed one" not in assembled.prompt.text


async def test__assemble__previous_comments_off__not_shown() -> None:
    first = make_iteration(number=1, comments=[make_comment(body="Reported and kept")])
    config = BriefConfig(include_context=False, include_previous_comments=False)

    assembled = await assemble_prompt(make_review(iterations=[first]), _vcs([]), config, iteration_number=2)

    assert "Already Reported" not in assembled.prompt.text


def test__previous_comments__first_iteration__none() -> None:
    review = make_review(iterations=[make_iteration(number=1, comments=[make_comment()])])

    assert previous_comments(review, 1) is None


def test__previous_comments__latest_earlier_iteration_used() -> None:
    first = make_iteration(number=1, comments=[make_comment(body="from one")])
    second = make_iteration(number=2, comments=[make_comment(body="from two")])
    third = make_iteration(number=3, comments=[make_comment(body="from three")])
    review = make_review(iterations=[first, second, third])

    previous = previous_comments(review, 3)

    assert previous is not None
    assert previous.iteration_number == 2
    assert [c.body for c in previous.comments] == ["from two"]


def test__dispatch_target_number__open_last_iteration_reused_posted_one_followed() -> None:
    open_last = make_review(iterations=[make_iteration(number=1, stage=IterationStage.polish)])
    posted_last = make_review(iterations=[make_iteration(number=1, stage=IterationStage.post, completed_at=_NOW)])

    assert dispatch_target_number(open_last) == 1
    assert dispatch_target_number(posted_last) == 2
    assert dispatch_target_number(make_review(iterations=[])) == 1
