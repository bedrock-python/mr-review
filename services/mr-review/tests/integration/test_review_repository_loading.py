"""Loading review files that older versions wrote, or that were edited by hand."""

from __future__ import annotations

from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest
import yaml
from mr_review.core.reviews.entities import IterationStage
from mr_review.infra.repositories.review import FileReviewRepository

from tests.factories.entities import make_comment, make_iteration

pytestmark = pytest.mark.integration


async def _stored_review_id(review_repo: FileReviewRepository) -> UUID:
    review = await review_repo.create(host_id=uuid4(), repo_path="ns/repo", mr_iid=1)
    iteration = make_iteration(comments=[make_comment(body="One"), make_comment(body="Two")])
    await review_repo.update(review.model_copy(update={"iterations": [iteration]}))
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
