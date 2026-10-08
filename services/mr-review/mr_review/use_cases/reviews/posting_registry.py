"""Which reviews are being posted right now, in this process."""

from __future__ import annotations

import asyncio
from collections.abc import Coroutine
from typing import Any, TypeVar
from uuid import UUID

_T = TypeVar("_T")


class PostInProgressError(Exception):
    """A post of the review is running; it must finish before the review is posted or edited again."""

    def __init__(self, review_id: UUID) -> None:
        self.review_id = review_id
        super().__init__(
            "This review's comments are being posted right now; "
            "its result shows up on the review once the post finishes"
        )


class PostingRegistry:
    """Posts running in this process, one per review.

    A post runs as its own task, kept here until it is done: it finishes and records every outcome
    even when the request that started it is cancelled. While it runs, another post of the same
    review is refused, and so is any change to the review's comments: every write replaces the whole
    stored review, so one that read the review before the post's last write would undo its records.
    """

    def __init__(self) -> None:
        self._running: dict[UUID, asyncio.Task[Any]] = {}

    def is_running(self, review_id: UUID) -> bool:
        return review_id in self._running

    def ensure_idle(self, review_id: UUID) -> None:
        """Raise ``PostInProgressError`` while a post of the review runs."""
        if self.is_running(review_id):
            raise PostInProgressError(review_id)

    def start(self, review_id: UUID, work: Coroutine[Any, Any, _T]) -> asyncio.Task[_T]:
        if self.is_running(review_id):
            work.close()
            raise PostInProgressError(review_id)
        task = asyncio.get_running_loop().create_task(work)
        self._running[review_id] = task
        task.add_done_callback(lambda done: self._finished(review_id, done))
        return task

    def _finished(self, review_id: UUID, task: asyncio.Task[Any]) -> None:
        if self._running.get(review_id) is task:
            del self._running[review_id]
        if not task.cancelled():
            # Retrieved here as well: when the request is gone nobody else will.
            task.exception()
