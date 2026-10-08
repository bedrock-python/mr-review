"""Read-modify-write of one review through a pure change function."""

from __future__ import annotations

from collections.abc import Callable
from uuid import UUID

from mr_review.core.reviews.entities import Review
from mr_review.core.reviews.repositories import ReviewRepository

ReviewChange = Callable[[Review], Review]


async def apply_review_change(repo: ReviewRepository, review_id: UUID, change: ReviewChange) -> Review:
    """Apply ``change`` to the stored review and persist the result, atomically.

    Every write that edits part of a review goes through here, with the decision of what to
    change kept in a pure function. The repository runs it against the review as stored,
    under that review's lock, so concurrent changes are applied one after another and none
    is overwritten by a stale copy. Returning the review unchanged writes nothing.

    Raises ``ValueError`` when the review does not exist; ``change`` may raise its own errors,
    in which case nothing is written.
    """
    updated = await repo.update_with(review_id, change)
    if updated is None:
        raise ValueError(f"Review {review_id} not found")
    return updated
