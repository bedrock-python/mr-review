from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from mr_review.core.reviews.entities import BriefConfig, Comment, Iteration, IterationStage, Review
from mr_review.core.reviews.repositories import ReviewRepository


class UpdateReviewUseCase:
    def __init__(self, repo: ReviewRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        review_id: UUID,
        brief_config: BriefConfig | None = None,
        iteration_id: UUID | None = None,
        iteration_stage: IterationStage | None = None,
        iteration_comments: list[Comment] | None = None,
    ) -> Review:
        review = await self._repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        review_updates: dict[str, object] = {}

        if brief_config is not None:
            last = review.iterations[-1] if review.iterations else None
            if last is None:
                # No iterations yet — create an initial one with the given brief_config
                new_iteration = Iteration(
                    id=uuid4(),
                    number=1,
                    stage=IterationStage.brief,
                    comments=[],
                    ai_provider_id=None,
                    model=None,
                    brief_config=brief_config,
                    created_at=datetime.now(timezone.utc),
                    completed_at=None,
                )
                review_updates["iterations"] = [new_iteration]
            elif last.completed_at is None:
                idx = len(review.iterations) - 1
                new_iterations = list(review.iterations)
                new_iterations[idx] = last.model_copy(update={"brief_config": brief_config})
                review_updates["iterations"] = new_iterations

        if iteration_id is not None:
            review_updates["iterations"] = self._apply_iteration_update(
                review, review_id, iteration_id, iteration_stage, iteration_comments
            )

        updated = review.model_copy(update=review_updates)
        return await self._repo.update(updated)

    def _apply_iteration_update(
        self,
        review: Review,
        review_id: UUID,
        iteration_id: UUID,
        iteration_stage: IterationStage | None,
        iteration_comments: list[Comment] | None,
    ) -> list[object]:
        iteration_index = next(
            (i for i, it in enumerate(review.iterations) if it.id == iteration_id),
            None,
        )
        if iteration_index is None:
            raise ValueError(f"Iteration {iteration_id} not found on review {review_id}")

        iteration = review.iterations[iteration_index]
        iteration_updates: dict[str, object] = {}
        if iteration_stage is not None:
            iteration_updates["stage"] = iteration_stage
        if iteration_comments is not None:
            iteration_updates["comments"] = iteration_comments

        new_iterations: list[object] = list(review.iterations)
        if iteration_updates:
            new_iterations[iteration_index] = iteration.model_copy(update=iteration_updates)
        return new_iterations
