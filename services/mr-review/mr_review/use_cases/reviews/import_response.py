from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import partial
from uuid import UUID, uuid4

from mr_review.core.reviews.entities import BriefConfig, Iteration, IterationStage, Review
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.use_cases.reviews._answer_settlement import bounded_raw_response, within_brief
from mr_review.use_cases.reviews._review_change import apply_review_change
from mr_review.use_cases.reviews.ai_response_parser import ParseResult, parse_ai_response
from mr_review.use_cases.reviews.comment_limits import LimitedComments
from mr_review.use_cases.reviews.iteration_comments import find_iteration_index, replace_iteration


@dataclass(frozen=True, slots=True)
class ImportOutcome:
    result: ParseResult
    # Comments stored on the iteration; 0 when nothing parsed (the iteration is left alone then).
    stored: int
    # Parsed comments dropped by the brief's minimum severity or comment cap.
    filtered: int


def _first_iteration() -> Iteration:
    return Iteration(
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


def _apply_answer(
    review: Review,
    *,
    iteration_id: UUID | None,
    raw: str,
    result: ParseResult,
    limited: list[LimitedComments],
) -> Review:
    """Store the parsed answer on the target iteration: ``iteration_id``, else the last one,
    else a first iteration created for it. Pure; ``limited`` receives what was kept."""
    if iteration_id is not None:
        index = find_iteration_index(review, iteration_id)
    elif review.iterations:
        index = len(review.iterations) - 1
    else:
        review = review.model_copy(update={"iterations": [_first_iteration()]})
        index = 0

    target = review.iterations[index]
    kept = within_brief(target, result.comments)
    limited.append(kept)
    answered = target.model_copy(
        update={
            "stage": IterationStage.polish,
            "comments": kept.comments,
            "raw_response": bounded_raw_response(raw),
        }
    )
    return replace_iteration(review, index, answered)


class ImportResponseUseCase:
    def __init__(self, review_repo: ReviewRepository) -> None:
        self._review_repo = review_repo

    async def execute(self, review_id: UUID, raw: str, iteration_id: UUID | None = None) -> ImportOutcome:
        if await self._review_repo.get_by_id(review_id) is None:
            raise ValueError(f"Review {review_id} not found")

        result = await asyncio.to_thread(parse_ai_response, raw)
        if not result.comments:
            return ImportOutcome(result=result, stored=0, filtered=0)

        # The target iteration is resolved again on the stored review, under its lock: an
        # iteration started or edited while the answer was parsed is not overwritten.
        limited: list[LimitedComments] = []
        change = partial(_apply_answer, iteration_id=iteration_id, raw=raw, result=result, limited=limited)
        await apply_review_change(self._review_repo, review_id, change)
        kept = limited[-1]
        return ImportOutcome(result=result, stored=len(kept.comments), filtered=kept.filtered)
