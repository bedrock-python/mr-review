from __future__ import annotations

from uuid import UUID

from mr_review.core.reviews.entities import Review
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.use_cases.reviews.iteration_comments import (
    ensure_iteration_editable,
    find_iteration_index,
    replace_iteration,
)


class DeleteCommentUseCase:
    """Remove one comment from an iteration that has not been posted yet."""

    def __init__(self, repo: ReviewRepository) -> None:
        self._repo = repo

    async def execute(self, review_id: UUID, iteration_id: UUID, comment_id: UUID) -> Review:
        """Delete the comment and return the updated review.

        Raises ``ValueError`` for an unknown review, iteration or comment and
        ``IterationLockedError`` when the iteration was already posted.
        """
        review = await self._repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        index = find_iteration_index(review, iteration_id)
        iteration = review.iterations[index]
        remaining = [c for c in iteration.comments if c.id != comment_id]
        if len(remaining) == len(iteration.comments):
            raise ValueError(f"Comment {comment_id} not found on iteration {iteration_id}")
        ensure_iteration_editable(iteration)

        updated_iteration = iteration.model_copy(update={"comments": remaining})
        return await self._repo.update(replace_iteration(review, index, updated_iteration))
