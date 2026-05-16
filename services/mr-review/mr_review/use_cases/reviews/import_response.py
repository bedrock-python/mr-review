from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

from mr_review.core.reviews.entities import BriefConfig, Iteration, IterationStage
from mr_review.infra.repositories.review import FileReviewRepository
from mr_review.use_cases.reviews.dispatch_review import ParseResult, parse_ai_response


class ImportResponseUseCase:
    def __init__(self, review_repo: FileReviewRepository) -> None:
        self._review_repo = review_repo

    async def execute(self, review_id: UUID, raw: str, iteration_id: UUID | None = None) -> ParseResult:
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        result = parse_ai_response(raw)
        if not result.comments:
            return result

        # Resolve or create the target iteration
        if iteration_id is not None:
            idx = next((i for i, it in enumerate(review.iterations) if it.id == iteration_id), None)
            if idx is None:
                raise ValueError(f"Iteration {iteration_id} not found on review {review_id}")
        elif review.iterations:
            idx = len(review.iterations) - 1
        else:
            # No iterations exist — create one
            new_iteration = Iteration(
                id=uuid4(),
                number=1,
                stage=IterationStage.brief,
                comments=[],
                ai_provider_id=None,
                model=None,
                brief_config=BriefConfig(),
                created_at=datetime.now(timezone.utc),
                completed_at=None,
            )
            new_iterations = [new_iteration]
            review = await self._review_repo.update(review.model_copy(update={"iterations": new_iterations}))
            idx = 0

        updated_iteration = review.iterations[idx].model_copy(
            update={"stage": IterationStage.polish, "comments": result.comments}
        )
        new_iterations = list(review.iterations)
        new_iterations[idx] = updated_iteration
        await self._review_repo.update(review.model_copy(update={"iterations": new_iterations}))

        return result
