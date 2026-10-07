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
        def _change(review: Review) -> Review:
            return self._with_next_iteration(review, brief_config)

        # Applied to the stored review under the repository's lock: a dispatch finishing
        # at the same moment is not overwritten, and two clicks do not both append.
        updated = await self._repo.update_with(review_id, _change)
        if updated is None:
            raise ValueError(f"Review {review_id} not found")
        return updated

    def _with_next_iteration(self, review: Review, brief_config: BriefConfig | None) -> Review:
        # Reuse the last iteration while it has not reached Post; one that was posted, even only in
        # part, keeps its comments as they went to the MR.
        if review.iterations and not review.iterations[-1].reached_post:
            last = review.iterations[-1]
            if brief_config is not None and last.brief_config != brief_config:
                updated_last = last.model_copy(update={"brief_config": brief_config})
                new_iterations = list(review.iterations[:-1]) + [updated_last]
                return review.model_copy(update={"iterations": new_iterations})
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
        return review.model_copy(update={"iterations": new_iterations})
