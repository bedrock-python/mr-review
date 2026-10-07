"""Test doubles for the repositories' atomic change methods."""

from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar
from unittest.mock import AsyncMock
from uuid import UUID

from mr_review.core.hosts.entities import Host
from mr_review.core.reviews.entities import Review

_E = TypeVar("_E", Host, Review)


def stub_update_with(repo: AsyncMock, stored: _E | None) -> list[_E]:
    """Make ``repo.update_with`` apply its change to ``stored``, as the real repositories do.

    Returns the list every written entity is appended to. A change that hands back the very
    object it was given is not a write, and an unknown id yields ``None``.
    """
    writes: list[_E] = []

    async def _update_with(record_id: UUID, change: Callable[[_E], _E]) -> _E | None:
        if stored is None or record_id != stored.id:
            return None
        updated = change(stored)
        if updated is not stored:
            writes.append(updated)
        return updated

    repo.update_with.side_effect = _update_with
    return writes


class SingleReviewRepository:
    """A review repository holding one review, with the file repository's change semantics.

    It answers every id with that review, since unit tests address it by a throwaway id, and
    sees its own writes. ``writes`` lists every review stored, in order; a change that hands
    back the very object it was given is not a write.
    """

    def __init__(self, review: Review | None) -> None:
        self.review = review
        self.writes: list[Review] = []

    @property
    def last_write(self) -> Review:
        assert self.writes, "nothing was written"
        return self.writes[-1]

    async def get_by_id(self, _review_id: UUID) -> Review | None:
        return self.review

    async def update_with(self, review_id: UUID, change: Callable[[Review], Review]) -> Review | None:
        if self.review is None:
            return None
        return self._store(change(self.review))

    async def upsert_with(self, review_id: UUID, change: Callable[[Review | None], Review | None]) -> Review | None:
        updated = change(self.review)
        return self.review if updated is None else self._store(updated)

    def _store(self, updated: Review) -> Review:
        if updated is not self.review:
            self.writes.append(updated)
            self.review = updated
        return updated
