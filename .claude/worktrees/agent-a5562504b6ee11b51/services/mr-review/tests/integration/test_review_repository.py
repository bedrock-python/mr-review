from __future__ import annotations

from uuid import uuid4

import pytest
from mr_review.core.reviews.entities import BriefConfig, BriefPreset, Comment, ReviewStage
from mr_review.infra.repositories.host import SQLiteHostRepository
from mr_review.infra.repositories.review import SQLiteReviewRepository

_TOKEN = "test-token"  # noqa: S105


@pytest.mark.integration
async def test_create_and_get_review(
    host_repo: SQLiteHostRepository,
    review_repo: SQLiteReviewRepository,
) -> None:
    host = await host_repo.create(name="GL", type_="gitlab", base_url="https://gl.com", token=_TOKEN)  # noqa: S106

    review = await review_repo.create(
        host_id=host.id,
        repo_path="team/service",
        mr_iid=42,
    )

    assert review.host_id == host.id
    assert review.repo_path == "team/service"
    assert review.mr_iid == 42
    assert review.stage == ReviewStage.pick
    assert review.comments == []

    fetched = await review_repo.get_by_id(review.id)
    assert fetched is not None
    assert fetched.id == review.id


@pytest.mark.integration
async def test_update_review_stage_and_comments(
    host_repo: SQLiteHostRepository,
    review_repo: SQLiteReviewRepository,
) -> None:
    host = await host_repo.create(name="GL2", type_="gitlab", base_url="https://gl.com", token=_TOKEN)  # noqa: S106
    review = await review_repo.create(host_id=host.id, repo_path="ns/repo", mr_iid=1)

    comment = Comment(
        id=uuid4(),
        file="src/main.py",
        line=10,
        severity="major",
        body="This is a problem",
    )
    updated = review.model_copy(update={"stage": ReviewStage.polish, "comments": [comment]})
    saved = await review_repo.update(updated)

    assert saved.stage == ReviewStage.polish
    assert len(saved.comments) == 1
    assert saved.comments[0].body == "This is a problem"


@pytest.mark.integration
async def test_list_reviews(
    host_repo: SQLiteHostRepository,
    review_repo: SQLiteReviewRepository,
) -> None:
    host = await host_repo.create(  # noqa: S106
        name="GL3", type_="github", base_url="https://api.github.com", token=_TOKEN
    )
    await review_repo.create(host_id=host.id, repo_path="owner/repo", mr_iid=1)
    await review_repo.create(host_id=host.id, repo_path="owner/repo", mr_iid=2)

    reviews = await review_repo.list_all()
    mr_iids = {r.mr_iid for r in reviews}
    assert 1 in mr_iids
    assert 2 in mr_iids


@pytest.mark.integration
async def test_update_brief_config(
    host_repo: SQLiteHostRepository,
    review_repo: SQLiteReviewRepository,
) -> None:
    host = await host_repo.create(name="GL4", type_="gitlab", base_url="https://gl.com", token=_TOKEN)  # noqa: S106
    review = await review_repo.create(host_id=host.id, repo_path="ns/r", mr_iid=5)

    new_config = BriefConfig(preset=BriefPreset.security, custom_instructions="Focus on SQL injection")
    updated = review.model_copy(update={"brief_config": new_config})
    saved = await review_repo.update(updated)

    assert saved.brief_config.preset == BriefPreset.security
    assert saved.brief_config.custom_instructions == "Focus on SQL injection"
