from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from mr_review.core.reviews.entities import BriefConfig, Iteration, IterationStage, Review
from mr_review.core.reviews.repositories import ReviewRepository


class CreateIterationUseCase:
    def __init__(self, repo: ReviewRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        review_id: UUID,
        brief_config: BriefConfig | None = None,
    ) -> Review:
        review = await self._repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        # If the last iteration is not completed, reuse it instead of creating a new one
        if review.iterations and review.iterations[-1].completed_at is None:
            last = review.iterations[-1]
            if brief_config is not None and last.brief_config != brief_config:
                updated_last = last.model_copy(update={"brief_config": brief_config})
                new_iterations = list(review.iterations[:-1]) + [updated_last]
                updated = review.model_copy(update={"iterations": new_iterations})
                return await self._repo.update(updated)
            return review

        iteration_brief_config = brief_config if brief_config is not None else review.brief_config
        number = len(review.iterations) + 1

        iteration = Iteration(
            id=uuid4(),
            number=number,
            stage=IterationStage.brief,
            comments=[],
            ai_provider_id=None,
            model=None,
            brief_config=iteration_brief_config,
            created_at=datetime.now(timezone.utc),
            completed_at=None,
        )

        new_iterations = list(review.iterations) + [iteration]
        updated = review.model_copy(update={"iterations": new_iterations})
        return await self._repo.update(updated)
