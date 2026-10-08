from __future__ import annotations

import asyncio
from dataclasses import dataclass
from functools import partial
from uuid import UUID

from mr_review.core.reviews.entities import Review
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.use_cases.reviews._answer_settlement import SettledAnswer, settle_reparsed_answer
from mr_review.use_cases.reviews._review_change import apply_review_change
from mr_review.use_cases.reviews.ai_response_parser import ParseResult, parse_ai_response
from mr_review.use_cases.reviews.iteration_comments import (
    ensure_iteration_editable,
    find_iteration_index,
    replace_iteration,
)


@dataclass(frozen=True, slots=True)
class ReparseOutcome:
    result: ParseResult
    # Comments the re-parse wrote: the parsed ones, or the general comment holding the answer;
    # 0 when the answer still could not be read and the iteration kept its comments.
    stored: int


def _stored_answer(review: Review, iteration_id: UUID) -> str:
    iteration = review.iterations[find_iteration_index(review, iteration_id)]
    ensure_iteration_editable(iteration)
    if iteration.raw_response is None:
        raise ValueError(f"Iteration {iteration_id} has no stored model response")
    return iteration.raw_response


def _apply_reparse(review: Review, *, iteration_id: UUID, result: ParseResult, settled: list[SettledAnswer]) -> Review:
    index = find_iteration_index(review, iteration_id)
    iteration = review.iterations[index]
    ensure_iteration_editable(iteration)
    outcome = settle_reparsed_answer(iteration, result)
    settled.append(outcome)
    return replace_iteration(review, index, outcome.iteration)


class ReparseIterationUseCase:
    """Parse an iteration's stored model answer again and replace its comments with the result."""

    def __init__(self, review_repo: ReviewRepository) -> None:
        self._review_repo = review_repo

    async def execute(self, review_id: UUID, iteration_id: UUID) -> ReparseOutcome:
        """Raises ``ValueError`` for an unknown review or iteration or one without a stored answer,
        and ``IterationLockedError`` for an iteration that was already posted."""
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")
        raw = _stored_answer(review, iteration_id)

        result = await asyncio.to_thread(parse_ai_response, raw)
        settled: list[SettledAnswer] = []
        change = partial(_apply_reparse, iteration_id=iteration_id, result=result, settled=settled)
        await apply_review_change(self._review_repo, review_id, change)
        outcome = settled[-1]
        return ReparseOutcome(result=result, stored=len(outcome.iteration.comments) if outcome.applied else 0)
