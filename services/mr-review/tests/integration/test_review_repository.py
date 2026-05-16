from __future__ import annotations

from uuid import uuid4

import pytest
from mr_review.core.reviews.entities import BriefConfig, BriefPreset, IterationStage
from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.repositories.review import FileReviewRepository

from tests.factories.entities import make_comment, make_iteration

pytestmark = pytest.mark.integration

_TOKEN = "test-token"  # noqa: S105


async def test__review_repo_create__valid_params__returns_entity_with_expected_fields(
    host_repo: FileHostRepository,
    review_repo: FileReviewRepository,
) -> None:
    """repo.create stores a new review with empty iterations list."""
    host = await host_repo.create(name="GL", type_="gitlab", base_url="https://gl.com", token=_TOKEN)  # noqa: S106

    review = await review_repo.create(host_id=host.id, repo_path="team/service", mr_iid=42)

    assert review.host_id == host.id
    assert review.repo_path == "team/service"
    assert review.mr_iid == 42
    assert review.iterations == []


async def test__review_repo_get_by_id__review_exists__returns_matching_entity(
    host_repo: FileHostRepository,
    review_repo: FileReviewRepository,
) -> None:
    """repo.get_by_id returns the exact review that was previously created."""
    host = await host_repo.create(name="GL", type_="gitlab", base_url="https://gl.com", token=_TOKEN)  # noqa: S106
    created = await review_repo.create(host_id=host.id, repo_path="ns/repo", mr_iid=1)

    fetched = await review_repo.get_by_id(created.id)

    assert fetched is not None
    assert fetched.id == created.id


async def test__review_repo_get_by_id__review_not_found__returns_none(
    review_repo: FileReviewRepository,
) -> None:
    """repo.get_by_id returns None for an ID that was never persisted."""
    result = await review_repo.get_by_id(uuid4())

    assert result is None


async def test__review_repo_list_all__multiple_reviews_created__returns_all(
    host_repo: FileHostRepository,
    review_repo: FileReviewRepository,
) -> None:
    """repo.list_all returns every review that has been created."""
    host = await host_repo.create(  # noqa: S106
        name="GH", type_="github", base_url="https://api.github.com", token=_TOKEN
    )
    await review_repo.create(host_id=host.id, repo_path="owner/repo", mr_iid=1)
    await review_repo.create(host_id=host.id, repo_path="owner/repo", mr_iid=2)

    reviews = await review_repo.list_all()

    mr_iids = {r.mr_iid for r in reviews}
    assert 1 in mr_iids
    assert 2 in mr_iids


async def test__review_repo_update__iterations_added__persists_iterations(
    host_repo: FileHostRepository,
    review_repo: FileReviewRepository,
) -> None:
    """repo.update persists a new list of iterations and returns them on the entity."""
    host = await host_repo.create(name="GL", type_="gitlab", base_url="https://gl.com", token=_TOKEN)  # noqa: S106
    review = await review_repo.create(host_id=host.id, repo_path="ns/repo", mr_iid=1)
    iteration = make_iteration(stage=IterationStage.dispatch, comments=[])
    updated = review.model_copy(update={"iterations": [iteration]})

    saved = await review_repo.update(updated)

    assert len(saved.iterations) == 1
    assert saved.iterations[0].stage == IterationStage.dispatch


async def test__review_repo_update__iteration_comments_added__persists_comments(
    host_repo: FileHostRepository,
    review_repo: FileReviewRepository,
) -> None:
    """repo.update persists comments inside an iteration."""
    host = await host_repo.create(name="GL", type_="gitlab", base_url="https://gl.com", token=_TOKEN)  # noqa: S106
    review = await review_repo.create(host_id=host.id, repo_path="ns/repo", mr_iid=1)
    comment = make_comment(file="src/main.py", line=10, severity="major", body="This is a problem")
    iteration = make_iteration(stage=IterationStage.polish, comments=[comment])
    updated = review.model_copy(update={"iterations": [iteration]})

    saved = await review_repo.update(updated)

    assert len(saved.iterations[0].comments) == 1
    assert saved.iterations[0].comments[0].body == "This is a problem"


async def test__review_repo_update__brief_config_changed__persists_new_config(
    host_repo: FileHostRepository,
    review_repo: FileReviewRepository,
) -> None:
    """repo.update persists a brief_config change carried inside an iteration."""
    host = await host_repo.create(name="GL", type_="gitlab", base_url="https://gl.com", token=_TOKEN)  # noqa: S106
    review = await review_repo.create(host_id=host.id, repo_path="ns/r", mr_iid=5)
    new_config = BriefConfig(preset=BriefPreset.security, custom_instructions="Focus on SQL injection")
    iteration = make_iteration(stage=IterationStage.brief, brief_config=new_config)
    updated = review.model_copy(update={"iterations": [iteration]})

    saved = await review_repo.update(updated)

    assert saved.brief_config.preset == BriefPreset.security
    assert saved.brief_config.custom_instructions == "Focus on SQL injection"
