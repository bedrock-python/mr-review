from __future__ import annotations

from uuid import UUID, uuid4

from mr_review.core.reviews.entities import Comment, Review
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.use_cases.reviews.iteration_comments import (
    CommentSeverity,
    ensure_iteration_editable,
    find_iteration_index,
    replace_iteration,
)


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
        review = await self._repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        index = find_iteration_index(review, iteration_id)
        iteration = review.iterations[index]
        ensure_iteration_editable(iteration)

        comment = Comment(
            id=uuid4(),
            file=file,
            # A line means nothing without a file: such a comment is posted as a general note.
            line=line if file is not None else None,
            severity=severity,
            body=body,
        )
        updated_iteration = iteration.model_copy(update={"comments": [*iteration.comments, comment]})
        return await self._repo.update(replace_iteration(review, index, updated_iteration))
