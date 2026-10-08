from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime, timezone
from uuid import UUID, uuid4

from mr_review.core.reviews.entities import BriefConfig, Iteration, IterationStage, Review
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.use_cases.reviews._review_change import apply_review_change
from mr_review.use_cases.reviews.dto import CommentPatchDTO
from mr_review.use_cases.reviews.iteration_comments import find_iteration_index, patch_comments, replace_iteration


def _apply_brief_config(review: Review, brief_config: BriefConfig) -> Review:
    last = review.iterations[-1] if review.iterations else None
    if last is None:
        first = Iteration(
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
        return review.model_copy(update={"iterations": [first]})
    if last.completed_at is None:
        updated_last = last.model_copy(update={"brief_config": brief_config})
        return replace_iteration(review, len(review.iterations) - 1, updated_last)
    return review


def apply_review_update(
    review: Review,
    brief_config: BriefConfig | None = None,
    iteration_id: UUID | None = None,
    iteration_stage: IterationStage | None = None,
    comment_patches: Sequence[CommentPatchDTO] | None = None,
) -> Review:
    """Return ``review`` with the requested changes applied; nothing is persisted.

    ``brief_config`` goes to the last open iteration (or a first one is created). The stage
    and the comment patches apply to ``iteration_id`` and are ignored without it. Raises
    ``ValueError`` for an unknown iteration and ``InvalidCommentPatchError`` for a patch that
    cannot apply.
    """
    # brief_config first, so the iteration patch below works on the already-updated list.
    if brief_config is not None:
        review = _apply_brief_config(review, brief_config)
    if iteration_id is None:
        return review

    index = find_iteration_index(review, iteration_id)
    if iteration_stage is not None:
        staged = review.iterations[index].model_copy(update={"stage": iteration_stage})
        review = replace_iteration(review, index, staged)
    if comment_patches is not None:
        review = patch_comments(review, iteration_id, comment_patches)
    return review


class UpdateReviewUseCase:
    def __init__(self, repo: ReviewRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        review_id: UUID,
        brief_config: BriefConfig | None = None,
        iteration_id: UUID | None = None,
        iteration_stage: IterationStage | None = None,
        comment_patches: Sequence[CommentPatchDTO] | None = None,
    ) -> Review:
        """Apply the update to the stored review in one read-modify-write."""
        return await apply_review_change(
            self._repo,
            review_id,
            lambda review: apply_review_update(review, brief_config, iteration_id, iteration_stage, comment_patches),
        )
