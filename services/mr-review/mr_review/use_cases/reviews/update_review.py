from __future__ import annotations

from uuid import UUID

from mr_review.core.reviews.entities import BriefConfig, Comment, Review, ReviewStage
from mr_review.infra.repositories.review import FileReviewRepository


class UpdateReviewUseCase:
    def __init__(self, repo: FileReviewRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        review_id: UUID,
        stage: ReviewStage | None = None,
        comments: list[Comment] | None = None,
        brief_config: BriefConfig | None = None,
    ) -> Review:
        review = await self._repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        updated = review.model_copy(
            update={
                k: v
                for k, v in {
                    "stage": stage,
                    "comments": comments,
                    "brief_config": brief_config,
                }.items()
                if v is not None
            }
        )
        return await self._repo.update(updated)
