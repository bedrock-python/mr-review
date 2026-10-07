from __future__ import annotations

import asyncio
from dataclasses import dataclass
from uuid import UUID

from mr_review.core.reviews.entities import IterationStage
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.use_cases.reviews.ai_response_parser import ParseResult, parse_ai_response
from mr_review.use_cases.reviews.iteration_comments import ensure_iteration_editable


@dataclass(frozen=True, slots=True)
class ReparseOutcome:
    result: ParseResult
    # Comments now on the iteration: the parsed ones, or the general comment holding the answer.
    stored: int


class ReparseIterationUseCase:
    """Parse an iteration's stored model answer again and replace its comments with the result.

    Exactly what a finished dispatch stores: when nothing in the answer parses, the answer itself
    becomes one general comment.
    """

    def __init__(self, review_repo: ReviewRepository) -> None:
        self._review_repo = review_repo

    async def execute(self, review_id: UUID, iteration_id: UUID) -> ReparseOutcome:
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")
        index = next((i for i, it in enumerate(review.iterations) if it.id == iteration_id), None)
        if index is None:
            raise ValueError(f"Iteration {iteration_id} not found on review {review_id}")
        iteration = review.iterations[index]
        ensure_iteration_editable(iteration)
        if iteration.raw_response is None:
            raise ValueError(f"Iteration {iteration_id} has no stored model response")

        result = await asyncio.to_thread(parse_ai_response, iteration.raw_response)
        comments = result.comments_to_store()
        iterations = list(review.iterations)
        iterations[index] = iteration.model_copy(update={"stage": IterationStage.polish, "comments": comments})
        await self._review_repo.update(review.model_copy(update={"iterations": iterations}))
        return ReparseOutcome(result=result, stored=len(comments))
