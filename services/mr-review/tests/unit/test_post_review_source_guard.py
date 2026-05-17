"""Tests for PostReviewUseCase's source guard (Phase 1 non-goal)."""

from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from mr_review.core.reviews.sources import BranchDiffSource
from mr_review.use_cases.reviews.post_review import PostNotSupportedForSourceError, PostReviewUseCase

from tests.factories.entities import make_review

pytestmark = pytest.mark.unit


async def test__post_review__branch_diff_source__raises_post_not_supported_error() -> None:
    """Posting comments back to the VCS is rejected for non-MR reviews.

    This guard enforces Phase 1's "in-app review only" scope: branch-diff
    reviews have no MR/PR target on the host, so PostReviewUseCase must refuse
    to run. The error is later mapped to HTTP 409 by the router.
    """
    review_repo = AsyncMock()
    host_repo = AsyncMock()
    review = make_review(source=BranchDiffSource(base_ref="main", head_ref="feature/x"))
    review_repo.get_by_id.return_value = review
    use_case = PostReviewUseCase(
        review_repo=review_repo,
        host_repo=host_repo,
        vcs_factory=lambda host: AsyncMock(),  # noqa: ARG005 (unused arg in stub)
    )

    with pytest.raises(PostNotSupportedForSourceError, match="branch_diff"):
        await use_case.execute(review_id=review.id)

    # Host should never be looked up — guard runs before any VCS access.
    host_repo.get_by_id.assert_not_called()


async def test__post_review__review_not_found__raises_value_error_not_source_error() -> None:
    """The not-found check must remain a ValueError so the router still returns 404."""
    review_repo = AsyncMock()
    host_repo = AsyncMock()
    review_repo.get_by_id.return_value = None
    use_case = PostReviewUseCase(
        review_repo=review_repo,
        host_repo=host_repo,
        vcs_factory=lambda host: AsyncMock(),  # noqa: ARG005
    )

    missing_id = uuid4()
    with pytest.raises(ValueError, match=str(missing_id)) as exc:
        await use_case.execute(review_id=missing_id)

    assert not isinstance(exc.value, PostNotSupportedForSourceError)
