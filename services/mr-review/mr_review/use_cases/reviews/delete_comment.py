from __future__ import annotations

from uuid import UUID

from mr_review.core.reviews.entities import Review
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.use_cases.reviews._review_change import apply_review_change
from mr_review.use_cases.reviews.iteration_comments import remove_comment
from mr_review.use_cases.reviews.posting_registry import PostingRegistry


class DeleteCommentUseCase:
    """Remove one comment from an iteration that has not been posted yet."""

    def __init__(self, repo: ReviewRepository, registry: PostingRegistry | None = None) -> None:
        self._repo = repo
        self._registry = registry

    async def execute(self, review_id: UUID, iteration_id: UUID, comment_id: UUID) -> Review:
        """Delete the comment and return the updated review.

        Raises ``ValueError`` for an unknown review, iteration or comment, ``IterationLockedError``
        when the iteration was already posted and ``PostInProgressError`` while the review is being
        posted.
        """
        if self._registry is not None:
            self._registry.ensure_idle(review_id)
        return await apply_review_change(
            self._repo, review_id, lambda review: remove_comment(review, iteration_id, comment_id)
        )
