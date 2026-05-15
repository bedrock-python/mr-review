from __future__ import annotations

from uuid import UUID

from mr_review.core.reviews.entities import Review
from mr_review.infra.repositories.review import SQLiteReviewRepository


class GetReviewUseCase:
    def __init__(self, repo: SQLiteReviewRepository) -> None:
        self._repo = repo

    async def execute(self, review_id: UUID) -> Review:
        review = await self._repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")
        return review
