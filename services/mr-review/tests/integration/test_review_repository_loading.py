"""Loading review files that older versions wrote, or that were edited by hand."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest
import yaml
from mr_review.core.reviews.entities import DEFAULT_PROMPT_BUDGET_CHARS, CommentPost, IterationStage
from mr_review.infra.repositories.review import FileReviewRepository

from tests.factories.entities import make_comment, make_iteration
from tests.fakes import save_review

pytestmark = pytest.mark.integration


async def _stored_review_id(review_repo: FileReviewRepository) -> UUID:
    review = await review_repo.create(host_id=uuid4(), repo_path="ns/repo", mr_iid=1)
    iteration = make_iteration(comments=[make_comment(body="One"), make_comment(body="Two")])
    await save_review(review_repo, review.model_copy(update={"iterations": [iteration]}))
    return review.id


def _edit_first_iteration(data_dir: Path, review_id: UUID, edit: Any) -> None:
    path = data_dir / "reviews" / f"{review_id}.yaml"
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    edit(data["iterations"][0])
    path.write_text(yaml.safe_dump(data, allow_unicode=True), encoding="utf-8")


async def test__review_repo__unknown_and_synonym_severities__normalised_on_load(
    data_dir: Path, review_repo: FileReviewRepository
) -> None:
    review_id = await _stored_review_id(review_repo)

    def edit(iteration: dict[str, Any]) -> None:
        iteration["comments"][0]["severity"] = "blocker"
        iteration["comments"][1]["severity"] = "something-new"

    _edit_first_iteration(data_dir, review_id, edit)

    loaded = await review_repo.get_by_id(review_id)
    listed = await review_repo.list_all()

    assert loaded is not None
    assert [c.severity for c in loaded.iterations[0].comments] == ["critical", "suggestion"]
    assert [r.id for r in listed] == [review_id]


async def test__review_repo__unreadable_comment__skipped_and_the_rest_loads(
    data_dir: Path, review_repo: FileReviewRepository
) -> None:
    review_id = await _stored_review_id(review_repo)

    def edit(iteration: dict[str, Any]) -> None:
        del iteration["comments"][0]["body"]
        iteration["comments"][1]["status"] = "archived"
        iteration["comments"].append("not a mapping")

    _edit_first_iteration(data_dir, review_id, edit)

    loaded = await review_repo.get_by_id(review_id)

    assert loaded is not None
    assert [(c.body, c.status) for c in loaded.iterations[0].comments] == [("Two", "kept")]


async def test__review_repo__missing_stage__defaults_to_brief(
    data_dir: Path, review_repo: FileReviewRepository
) -> None:
    review_id = await _stored_review_id(review_repo)
    _edit_first_iteration(data_dir, review_id, lambda iteration: iteration.pop("stage"))

    loaded = await review_repo.get_by_id(review_id)

    assert loaded is not None
    assert loaded.iterations[0].stage == IterationStage.brief


async def test__review_repo__brief_from_an_older_version__new_options_take_their_defaults(
    data_dir: Path, review_repo: FileReviewRepository
) -> None:
    review_id = await _stored_review_id(review_repo)

    def edit(iteration: dict[str, Any]) -> None:
        iteration["brief_config"] = {
            "preset": "security",
            "include_diff": True,
            "include_description": False,
            "include_full_files": False,
            "include_test_context": False,
            "include_related_code": False,
            "include_commit_history": False,
            "custom_instructions": "Mind the cache",
        }

    _edit_first_iteration(data_dir, review_id, edit)

    loaded = await review_repo.get_by_id(review_id)

    assert loaded is not None
    brief = loaded.iterations[0].brief_config
    assert (brief.preset, brief.include_description, brief.custom_instructions) == (
        "security",
        False,
        "Mind the cache",
    )
    assert brief.custom_preset_id is None
    assert brief.focus_areas == []
    assert brief.output_language == ""
    assert (brief.min_severity, brief.max_comments) == ("suggestion", None)
    assert (brief.include_paths, brief.exclude_paths, brief.use_default_excludes) == ([], [], True)
    assert brief.annotate_line_numbers is True
    assert brief.include_previous_comments is True
    assert brief.prompt_budget_chars == DEFAULT_PROMPT_BUDGET_CHARS


async def test__review_repo__brief_field_no_longer_valid__defaults_and_the_review_loads(
    data_dir: Path, review_repo: FileReviewRepository
) -> None:
    review_id = await _stored_review_id(review_repo)

    def edit(iteration: dict[str, Any]) -> None:
        iteration["brief_config"] = {"preset": "retired-preset", "max_comments": 0, "custom_instructions": "Keep"}

    _edit_first_iteration(data_dir, review_id, edit)

    loaded = await review_repo.get_by_id(review_id)

    assert loaded is not None
    brief = loaded.iterations[0].brief_config
    assert (brief.preset, brief.max_comments, brief.custom_instructions) == ("thorough", None, "Keep")


async def test__review_repo__post_record__round_trips(review_repo: FileReviewRepository) -> None:
    review = await review_repo.create(host_id=uuid4(), repo_path="ns/repo", mr_iid=1)
    posted_at = datetime(2026, 3, 4, 5, 6, tzinfo=timezone.utc)
    record = CommentPost(outcome="general_note", at=posted_at, note_id="17", url="https://h/n17", reason="why")
    comment = make_comment(body="One").model_copy(update={"post": record})
    await save_review(review_repo, review.model_copy(update={"iterations": [make_iteration(comments=[comment])]}))

    loaded = await review_repo.get_by_id(review.id)

    assert loaded is not None
    assert loaded.iterations[0].comments[0].post == record


async def test__review_repo__file_without_post_records__loads_as_never_posted(
    data_dir: Path, review_repo: FileReviewRepository
) -> None:
    """Files written before posts were recorded have no "post" key on their comments."""
    review_id = await _stored_review_id(review_repo)

    def edit(iteration: dict[str, Any]) -> None:
        for comment in iteration["comments"]:
            comment.pop("post", None)

    _edit_first_iteration(data_dir, review_id, edit)

    loaded = await review_repo.get_by_id(review_id)

    assert loaded is not None
    assert [c.post for c in loaded.iterations[0].comments] == [None, None]


async def test__review_repo__unreadable_post_record__drops_the_record_not_the_comment(
    data_dir: Path, review_repo: FileReviewRepository
) -> None:
    review_id = await _stored_review_id(review_repo)

    def edit(iteration: dict[str, Any]) -> None:
        iteration["comments"][0]["post"] = {"outcome": "teleported"}

    _edit_first_iteration(data_dir, review_id, edit)

    loaded = await review_repo.get_by_id(review_id)

    assert loaded is not None
    assert [(c.body, c.post) for c in loaded.iterations[0].comments] == [("One", None), ("Two", None)]
