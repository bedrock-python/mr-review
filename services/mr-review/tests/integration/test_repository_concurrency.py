"""Concurrent writes against the real YAML-file repositories.

Requests are handled concurrently on one event loop, so every read-modify-write in the
store can interleave with another one. These tests drive the repositories and use cases
the way concurrent HTTP requests do and check that nothing is lost or corrupted.
"""

from __future__ import annotations

import asyncio
import os
import stat
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import pytest
import yaml
from mr_review.api.config import Settings
from mr_review.core.reviews.entities import BriefConfig, BriefPreset, IterationStage
from mr_review.infra.di.providers.api_config import ApiConfigProvider
from mr_review.infra.repositories.ai_provider import FileAIProviderRepository
from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.repositories.review import FileReviewRepository
from mr_review.use_cases.hosts.toggle_favourite_repo import ToggleFavouriteRepoUseCase
from mr_review.use_cases.reviews.create_comment import CreateCommentUseCase
from mr_review.use_cases.reviews.create_iteration import CreateIterationUseCase
from mr_review.use_cases.reviews.create_review import CreateReviewUseCase
from mr_review.use_cases.reviews.update_review import UpdateReviewUseCase

from tests.factories.entities import make_comment, make_iteration

pytestmark = pytest.mark.integration

posix_only = pytest.mark.skipif(os.name == "nt", reason="POSIX permission bits")

_TOKEN = "test-token"  # noqa: S105


def _mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


async def test__review_update__concurrent_writers__never_fail_or_corrupt_the_file(
    review_repo: FileReviewRepository,
) -> None:
    """Concurrent updates of one review all succeed and leave a readable file behind."""
    review = await review_repo.create(host_id=uuid4(), repo_path="g/p", mr_iid=1)
    big = review.model_copy(
        update={
            "iterations": [
                make_iteration(
                    stage=IterationStage.polish,
                    comments=[make_comment(body="x" * 2000, line=i) for i in range(150)],
                )
            ]
        }
    )
    small = review.model_copy(update={"iterations": [make_iteration(comments=[make_comment()])]})

    for _ in range(15):
        results = await asyncio.gather(
            *(review_repo.update(big if i % 2 else small) for i in range(8)), return_exceptions=True
        )
        assert [r for r in results if isinstance(r, BaseException)] == []
        stored = await review_repo.get_by_id(review.id)
        assert stored is not None
        assert len(stored.iterations[0].comments) in {1, 150}

    assert [r.id for r in await review_repo.list_all()] == [review.id]


async def test__update_review__concurrent_patches_of_different_iterations__all_survive(
    review_repo: FileReviewRepository,
) -> None:
    """Each PATCH changes another iteration; none may be overwritten by a stale copy."""
    review = await review_repo.create(host_id=uuid4(), repo_path="g/p", mr_iid=1)
    iterations = [make_iteration(number=n, stage=IterationStage.dispatch) for n in range(1, 11)]
    review = await review_repo.update(review.model_copy(update={"iterations": iterations}))
    use_case = UpdateReviewUseCase(review_repo)

    await asyncio.gather(
        *(
            use_case.execute(review_id=review.id, iteration_id=it.id, iteration_stage=IterationStage.polish)
            for it in iterations
        )
    )

    stored = await review_repo.get_by_id(review.id)
    assert stored is not None
    assert [it.stage for it in stored.iterations] == [IterationStage.polish] * 10


async def test__brief_change_racing_a_new_comment__both_persist(
    review_repo: FileReviewRepository,
) -> None:
    """Saving the brief while a comment is added to the same iteration keeps both."""
    outcomes: list[tuple[BriefPreset, list[str]]] = []
    for _ in range(10):
        review = await review_repo.create(host_id=uuid4(), repo_path="g/p", mr_iid=1)
        first = make_iteration(number=1, stage=IterationStage.polish)
        review = await review_repo.update(review.model_copy(update={"iterations": [first]}))

        await asyncio.gather(
            CreateCommentUseCase(review_repo).execute(review.id, first.id, "major", "found a bug"),
            UpdateReviewUseCase(review_repo).execute(
                review_id=review.id, brief_config=BriefConfig(preset=BriefPreset.security)
            ),
        )

        stored = await review_repo.get_by_id(review.id)
        assert stored is not None
        outcomes.append((stored.iterations[0].brief_config.preset, [c.body for c in stored.iterations[0].comments]))

    assert outcomes == [(BriefPreset.security, ["found a bug"])] * 10


async def test__create_iteration__two_quick_clicks__append_one_iteration(review_repo: FileReviewRepository) -> None:
    review = await review_repo.create(host_id=uuid4(), repo_path="g/p", mr_iid=1)
    posted = make_iteration(number=1, stage=IterationStage.post, completed_at=datetime.now(timezone.utc))
    review = await review_repo.update(review.model_copy(update={"iterations": [posted]}))

    await asyncio.gather(*(CreateIterationUseCase(review_repo).execute(review_id=review.id) for _ in range(5)))

    stored = await review_repo.get_by_id(review.id)
    assert stored is not None
    assert [it.number for it in stored.iterations] == [1, 2]


async def test__create_review__two_quick_clicks__create_one_review(review_repo: FileReviewRepository) -> None:
    host_id = uuid4()
    use_case = CreateReviewUseCase(review_repo)

    reviews = await asyncio.gather(*(use_case.execute(host_id=host_id, repo_path="g/p", mr_iid=7) for _ in range(5)))

    assert len({r.id for r in reviews}) == 1
    assert len(await review_repo.list_all()) == 1


async def test__create_review__existing_review__is_returned(review_repo: FileReviewRepository) -> None:
    host_id = uuid4()
    existing = await review_repo.create(host_id=host_id, repo_path="g/p", mr_iid=7)

    found = await CreateReviewUseCase(review_repo).execute(host_id=host_id, repo_path="g/p", mr_iid=7)

    assert found.id == existing.id


async def test__toggle_favourite__ten_concurrent_toggles__none_is_lost(host_repo: FileHostRepository) -> None:
    host = await host_repo.create(name="h", type_="gitlab", base_url="https://x", token=_TOKEN)
    use_case = ToggleFavouriteRepoUseCase(host_repo)

    await asyncio.gather(*(use_case.execute(host.id, f"g/r{i}") for i in range(10)))

    stored = await host_repo.get_by_id(host.id)
    assert stored is not None
    assert sorted(stored.favourite_repos) == sorted(f"g/r{i}" for i in range(10))


async def test__host_create__concurrent_creates__all_hosts_are_stored(host_repo: FileHostRepository) -> None:
    created = await asyncio.gather(
        *(host_repo.create(name=f"h{i}", type_="gitlab", base_url="https://x", token=_TOKEN) for i in range(10))
    )

    assert {h.id for h in await host_repo.list_all()} == {h.id for h in created}


async def test__ai_provider_create__concurrent_creates__all_providers_are_stored(data_dir: Path) -> None:
    repo = FileAIProviderRepository(data_dir)

    created = await asyncio.gather(
        *(
            repo.create(name=f"p{i}", type_="claude", api_key="k", base_url="", models=["m"], max_concurrent=i + 1)
            for i in range(10)
        )
    )

    stored = await repo.list_all()
    assert {p.id for p in stored} == {p.id for p in created}


async def test__ai_provider_update__concurrent_field_updates__all_survive(data_dir: Path) -> None:
    repo = FileAIProviderRepository(data_dir)
    providers = [await repo.create(name=f"p{i}", type_="claude", api_key="k", base_url="", models=[]) for i in range(8)]

    await asyncio.gather(*(repo.update(p.id, name=f"renamed-{i}") for i, p in enumerate(providers)))

    assert sorted(p.name for p in await repo.list_all()) == sorted(f"renamed-{i}" for i in range(8))


async def test__host_upsert_with__new_and_existing_records__keep_ids_and_unknown_keys(
    host_repo: FileHostRepository, data_dir: Path
) -> None:
    host = await host_repo.create(name="h", type_="gitlab", base_url="https://x", token=_TOKEN)
    rows = yaml.safe_load((data_dir / "hosts.yaml").read_text())
    rows[0]["written_by_a_newer_version"] = "keep me"
    (data_dir / "hosts.yaml").write_text(yaml.safe_dump(rows))

    renamed = await host_repo.update_with(host.id, lambda h: h.model_copy(update={"name": "renamed"}))

    assert renamed is not None
    assert renamed.id == host.id
    assert renamed.created_at == host.created_at
    row = yaml.safe_load((data_dir / "hosts.yaml").read_text())[0]
    assert row["name"] == "renamed"
    assert row["written_by_a_newer_version"] == "keep me"


async def test__host_update_with__change_returns_same_object__writes_nothing(
    host_repo: FileHostRepository, data_dir: Path
) -> None:
    host = await host_repo.create(name="h", type_="gitlab", base_url="https://x", token=_TOKEN)
    before = (data_dir / "hosts.yaml").stat().st_ino

    result = await host_repo.update_with(host.id, lambda h: h)

    assert result == host
    assert (data_dir / "hosts.yaml").stat().st_ino == before


async def test__review_update_with__missing_review__returns_none(review_repo: FileReviewRepository) -> None:
    assert await review_repo.update_with(uuid4(), lambda r: r) is None


@posix_only
async def test__secret_files__written_by_the_repositories__are_owner_only(data_dir: Path) -> None:
    await FileHostRepository(data_dir).create(name="h", type_="gitlab", base_url="https://x", token=_TOKEN)
    await FileAIProviderRepository(data_dir).create(name="p", type_="claude", api_key="k", base_url="", models=[])
    review = await FileReviewRepository(data_dir).create(host_id=uuid4(), repo_path="g/p", mr_iid=1)

    assert _mode(data_dir / "hosts.yaml") == 0o600
    assert _mode(data_dir / "ai_providers.yaml") == 0o600
    assert _mode(data_dir / "reviews" / f"{review.id}.yaml") == 0o600


@posix_only
async def test__secret_files__left_world_readable_by_older_versions__are_tightened_on_start(data_dir: Path) -> None:
    for name in ("hosts.yaml", "ai_providers.yaml"):
        (data_dir / name).write_text("[]\n")
        (data_dir / name).chmod(0o644)

    FileHostRepository(data_dir)
    FileAIProviderRepository(data_dir)

    assert _mode(data_dir / "hosts.yaml") == 0o600
    assert _mode(data_dir / "ai_providers.yaml") == 0o600


@posix_only
def test__data_dir__created_on_start__is_owner_only(tmp_path: Path) -> None:
    data_dir = tmp_path / "mr-review"
    provider = ApiConfigProvider(Settings(data_dir=data_dir))

    provider.get_data_dir(Settings(data_dir=data_dir))

    assert _mode(data_dir) == 0o700
    assert _mode(data_dir / "reviews") == 0o700
