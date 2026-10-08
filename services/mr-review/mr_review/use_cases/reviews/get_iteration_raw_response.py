from __future__ import annotations

from uuid import UUID

from mr_review.core.reviews.repositories import ReviewRepository


class GetIterationRawResponseUseCase:
    """The model's answer stored on an iteration, exactly as it was received."""

    def __init__(self, review_repo: ReviewRepository) -> None:
        self._review_repo = review_repo

    async def execute(self, review_id: UUID, iteration_id: UUID) -> str:
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")
        iteration = next((it for it in review.iterations if it.id == iteration_id), None)
        if iteration is None:
            raise ValueError(f"Iteration {iteration_id} not found on review {review_id}")
        if iteration.raw_response is None:
            raise ValueError(f"Iteration {iteration_id} has no stored model response")
        return iteration.raw_response
