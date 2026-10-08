"""Read-modify-write of one review through a pure change function."""

from __future__ import annotations

from collections.abc import Callable
from uuid import UUID

from mr_review.core.reviews.entities import Review
from mr_review.core.reviews.repositories import ReviewRepository

ReviewChange = Callable[[Review], Review]


async def apply_review_change(repo: ReviewRepository, review_id: UUID, change: ReviewChange) -> Review:
    """Read the review, apply ``change`` to it and persist the result.

    Every write that edits part of a review goes through here, with the decision of what to
    change kept in a pure function: making the read and the write atomic is then a matter
    of handing ``change`` to a locking repository method instead.

    Raises ``ValueError`` when the review does not exist; ``change`` may raise its own errors,
    in which case nothing is written.
    """
    review = await repo.get_by_id(review_id)
    if review is None:
        raise ValueError(f"Review {review_id} not found")
    return await repo.update(change(review))
