"""Pure changes to an iteration's comment list, shared by the comment use cases."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal
from uuid import UUID

from mr_review.core.reviews.entities import Comment, Iteration, Review
from mr_review.use_cases.reviews.dto import CommentPatchDTO

CommentSeverity = Literal["critical", "major", "minor", "suggestion"]


class IterationLockedError(Exception):
    """Raised when an iteration that was already posted is asked to change its comment list."""


class InvalidCommentPatchError(Exception):
    """Raised when a patch would leave a comment in a shape that cannot be posted."""


def find_iteration_index(review: Review, iteration_id: UUID) -> int:
    """Return the position of ``iteration_id`` in ``review.iterations``.

    Raises ``ValueError`` when the review has no such iteration.
    """
    index = next((i for i, it in enumerate(review.iterations) if it.id == iteration_id), None)
    if index is None:
        raise ValueError(f"Iteration {iteration_id} not found on review {review.id}")
    return index


def ensure_iteration_editable(iteration: Iteration) -> None:
    """Refuse changes to an iteration that was posted — the same rule dispatch applies."""
    if iteration.reached_post:
        raise IterationLockedError(f"Iteration {iteration.id} was already posted; its comments can no longer change")


def replace_iteration(review: Review, index: int, iteration: Iteration) -> Review:
    """Return ``review`` with the iteration at ``index`` swapped for ``iteration``."""
    iterations = list(review.iterations)
    iterations[index] = iteration
    return review.model_copy(update={"iterations": iterations})


def apply_comment_patch(comment: Comment, patch: CommentPatchDTO) -> Comment:
    """Return ``comment`` with ``patch`` applied.

    Raises ``InvalidCommentPatchError`` when the result would carry a line without a file,
    e.g. a ``line`` patch on a general comment.
    """
    fields_set = patch.model_fields_set
    updates: dict[str, object] = {
        name: value
        for name in ("status", "body", "severity", "resolved")
        if (value := getattr(patch, name)) is not None
    }
    if "file" in fields_set:
        updates["file"] = patch.file
        if patch.file is None:
            updates["line"] = None
    if "line" in fields_set:
        updates["line"] = patch.line
    updated = comment.model_copy(update=updates)
    if {"file", "line"} & fields_set and updated.file is None and updated.line is not None:
        raise InvalidCommentPatchError(f"Comment {comment.id} is a general comment; set file together with line")
    return updated


def patch_comments(review: Review, iteration_id: UUID, patches: Sequence[CommentPatchDTO]) -> Review:
    """Apply per-comment patches to one iteration; ids it does not have are ignored.

    Raises ``ValueError`` for an unknown iteration and ``InvalidCommentPatchError`` for a
    patch that cannot apply.
    """
    index = find_iteration_index(review, iteration_id)
    iteration = review.iterations[index]
    by_id = {patch.id: patch for patch in patches}
    comments = [
        apply_comment_patch(c, patch) if (patch := by_id.get(c.id)) is not None else c for c in iteration.comments
    ]
    return replace_iteration(review, index, iteration.model_copy(update={"comments": comments}))


def append_comment(review: Review, iteration_id: UUID, comment: Comment) -> Review:
    """Add ``comment`` at the end of an iteration that has not been posted.

    Raises ``ValueError`` for an unknown iteration and ``IterationLockedError`` for a posted one.
    """
    index = find_iteration_index(review, iteration_id)
    iteration = review.iterations[index]
    ensure_iteration_editable(iteration)
    return replace_iteration(review, index, iteration.model_copy(update={"comments": [*iteration.comments, comment]}))


def remove_comment(review: Review, iteration_id: UUID, comment_id: UUID) -> Review:
    """Drop one comment from an iteration that has not been posted.

    Raises ``ValueError`` for an unknown iteration or comment and ``IterationLockedError``
    for a posted iteration.
    """
    index = find_iteration_index(review, iteration_id)
    iteration = review.iterations[index]
    remaining = [c for c in iteration.comments if c.id != comment_id]
    if len(remaining) == len(iteration.comments):
        raise ValueError(f"Comment {comment_id} not found on iteration {iteration_id}")
    ensure_iteration_editable(iteration)
    return replace_iteration(review, index, iteration.model_copy(update={"comments": remaining}))
