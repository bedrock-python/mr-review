"""Tests for the ReviewSource discriminated union and Review back-compat."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from mr_review.core.reviews.entities import Review
from mr_review.core.reviews.sources import BranchDiffSource, MRSource

pytestmark = pytest.mark.unit


def test__review__legacy_mr_iid_only__source_defaults_to_mr_source_with_iid() -> None:
    """Constructing a Review with only mr_iid yields a synchronised MRSource."""
    now = datetime.now(timezone.utc)
    review = Review(
        id=uuid4(),
        host_id=uuid4(),
        repo_path="team/service",
        mr_iid=42,
        created_at=now,
        updated_at=now,
    )

    assert isinstance(review.source, MRSource)
    assert review.source.mr_iid == 42
    assert review.mr_iid == 42


def test__review__branch_diff_source__mr_iid_stays_zero() -> None:
    """A BranchDiffSource review keeps mr_iid=0 and exposes branch refs."""
    now = datetime.now(timezone.utc)
    source = BranchDiffSource(base_ref="main", head_ref="feature/x", title="Pre-MR check")
    review = Review(
        id=uuid4(),
        host_id=uuid4(),
        repo_path="team/service",
        source=source,
        created_at=now,
        updated_at=now,
    )

    assert isinstance(review.source, BranchDiffSource)
    assert review.mr_iid == 0
    assert review.source.head_ref == "feature/x"
    assert review.source.base_ref == "main"
    assert review.source.title == "Pre-MR check"


def test__review__mr_source_with_iid__mr_iid_overrides_zero_default() -> None:
    """If only source.mr_iid is set the validator copies it onto Review.mr_iid."""
    now = datetime.now(timezone.utc)
    review = Review(
        id=uuid4(),
        host_id=uuid4(),
        repo_path="team/service",
        source=MRSource(mr_iid=99),
        created_at=now,
        updated_at=now,
    )

    assert review.source.mr_iid == 99
    assert review.mr_iid == 99


def test__review_source__discriminator__roundtrips_through_json() -> None:
    """The discriminated union deserialises by ``kind`` cleanly."""
    payload_mr = MRSource(mr_iid=7).model_dump()
    payload_branch = BranchDiffSource(base_ref="main", head_ref="x").model_dump()

    parsed_mr = MRSource.model_validate(payload_mr)
    parsed_branch = BranchDiffSource.model_validate(payload_branch)

    assert parsed_mr.kind == "mr"
    assert parsed_branch.kind == "branch_diff"
