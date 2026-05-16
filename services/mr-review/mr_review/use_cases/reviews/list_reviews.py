from __future__ import annotations

from mr_review.core.reviews.entities import Review
from mr_review.core.reviews.repositories import ReviewRepository


class ListReviewsUseCase:
    def __init__(self, repo: ReviewRepository) -> None:
        self._repo = repo

    async def execute(self) -> list[Review]:
        return await self._repo.list_all()
