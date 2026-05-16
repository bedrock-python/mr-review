from uuid import UUID

from mr_review.core.reviews.repositories import ReviewRepository


class DeleteReviewUseCase:
    def __init__(self, repo: ReviewRepository) -> None:
        self._repo = repo

    async def execute(self, review_id: UUID) -> None:
        deleted = await self._repo.delete(review_id)
        if not deleted:
            raise ValueError(f"Review {review_id} not found")
