"""Helpers shared by the use cases that add or remove single iteration comments."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from mr_review.core.reviews.entities import Iteration, IterationStage, Review

CommentSeverity = Literal["critical", "major", "minor", "suggestion"]


class IterationLockedError(Exception):
    """Raised when an iteration that was already posted is asked to change its comment list."""


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
    if iteration.completed_at is not None or iteration.stage == IterationStage.post:
        raise IterationLockedError(f"Iteration {iteration.id} was already posted; its comments can no longer change")


def replace_iteration(review: Review, index: int, iteration: Iteration) -> Review:
    """Return ``review`` with the iteration at ``index`` swapped for ``iteration``."""
    iterations = list(review.iterations)
    iterations[index] = iteration
    return review.model_copy(update={"iterations": iterations})
