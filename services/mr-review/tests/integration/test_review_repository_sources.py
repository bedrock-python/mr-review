"""Integration tests for FileReviewRepository source handling and back-compat."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
import yaml
from mr_review.core.reviews.sources import BranchDiffSource, MRSource
from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.repositories.review import FileReviewRepository

pytestmark = pytest.mark.integration

_TOKEN = "test-token"  # noqa: S105


async def test__create_from_source__branch_diff__persists_with_mr_iid_zero(
    host_repo: FileHostRepository,
    review_repo: FileReviewRepository,
) -> None:
    """A branch-diff review round-trips through YAML with its refs intact."""
    host = await host_repo.create(name="GH", type_="github", base_url="https://api.github.com", token=_TOKEN)  # noqa: S106
    source = BranchDiffSource(base_ref="main", head_ref="feature/x", title="Pre-MR")

    review = await review_repo.create_from_source(host_id=host.id, repo_path="o/r", source=source)
    fetched = await review_repo.get_by_id(review.id)

    assert fetched is not None
    assert isinstance(fetched.source, BranchDiffSource)
    assert fetched.source.base_ref == "main"
    assert fetched.source.head_ref == "feature/x"
    assert fetched.source.title == "Pre-MR"
    assert fetched.mr_iid == 0


async def test__create_from_source__mr_source__keeps_legacy_mr_iid_field(
    host_repo: FileHostRepository,
    review_repo: FileReviewRepository,
) -> None:
    """MRSource reviews keep mr_iid set so legacy code paths still work."""
    host = await host_repo.create(name="GH", type_="github", base_url="https://api.github.com", token=_TOKEN)  # noqa: S106

    review = await review_repo.create_from_source(host_id=host.id, repo_path="o/r", source=MRSource(mr_iid=42))
    fetched = await review_repo.get_by_id(review.id)

    assert fetched is not None
    assert isinstance(fetched.source, MRSource)
    assert fetched.source.mr_iid == 42
    assert fetched.mr_iid == 42


async def test__get_by_id__legacy_yaml_without_source__loads_as_mr_source(
    data_dir: Path,
    review_repo: FileReviewRepository,
) -> None:
    """Reviews persisted before the source field exists default to MRSource."""
    review_id = uuid4()
    host_id = uuid4()
    legacy_payload = {
        "id": str(review_id),
        "host_id": str(host_id),
        "repo_path": "team/svc",
        "mr_iid": 11,
        "iterations": [],
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    }
    (data_dir / "reviews" / f"{review_id}.yaml").write_text(yaml.safe_dump(legacy_payload), encoding="utf-8")

    fetched = await review_repo.get_by_id(review_id)

    assert fetched is not None
    assert isinstance(fetched.source, MRSource)
    assert fetched.source.mr_iid == 11
    assert fetched.mr_iid == 11


async def test__get_by_mr__only_matches_mr_source_reviews(
    host_repo: FileHostRepository,
    review_repo: FileReviewRepository,
) -> None:
    """get_by_mr ignores branch-diff reviews even if mr_iid collides on 0."""
    host = await host_repo.create(name="GH", type_="github", base_url="https://api.github.com", token=_TOKEN)  # noqa: S106
    await review_repo.create_from_source(
        host_id=host.id,
        repo_path="o/r",
        source=BranchDiffSource(base_ref="main", head_ref="feature/x"),
    )
    mr_review = await review_repo.create(host_id=host.id, repo_path="o/r", mr_iid=5)

    found = await review_repo.get_by_mr(host_id=host.id, repo_path="o/r", mr_iid=5)
    not_found = await review_repo.get_by_mr(host_id=host.id, repo_path="o/r", mr_iid=0)

    assert found is not None
    assert found.id == mr_review.id
    assert not_found is None
