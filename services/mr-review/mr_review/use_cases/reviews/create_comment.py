from __future__ import annotations

from uuid import UUID, uuid4

from mr_review.core.reviews.entities import Comment, Review
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.use_cases.reviews._review_change import apply_review_change
from mr_review.use_cases.reviews.iteration_comments import CommentSeverity, append_comment


class CreateCommentUseCase:
    """Append a hand-written comment to an iteration that has not been posted yet."""

    def __init__(self, repo: ReviewRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        review_id: UUID,
        iteration_id: UUID,
        severity: CommentSeverity,
        body: str,
        file: str | None = None,
        line: int | None = None,
    ) -> Review:
        """Add the comment with a server-assigned id and return the updated review.

        Raises ``ValueError`` for an unknown review or iteration and
        ``IterationLockedError`` when the iteration was already posted.
        """
        comment = Comment(
            id=uuid4(),
            file=file,
            # A line means nothing without a file: such a comment is posted as a general note.
            line=line if file is not None else None,
            severity=severity,
            body=body,
        )
        return await apply_review_change(
            self._repo, review_id, lambda review: append_comment(review, iteration_id, comment)
        )
