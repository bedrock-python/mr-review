from __future__ import annotations

from collections.abc import Callable
from typing import Protocol
from uuid import UUID

from mr_review.core.reviews.entities import BriefConfig, Review
from mr_review.core.reviews.sources import ReviewSource


class ReviewRepository(Protocol):
    """Reviews, one record per review.

    There is deliberately no blind overwrite: every change goes through :meth:`update_with`
    or :meth:`upsert_with`, which apply it to the review as stored, under that review's lock,
    so a change derived from an older read can never replace a newer one.
    """

    async def create(
        self,
        host_id: UUID,
        repo_path: str,
        mr_iid: int,
        brief_config: BriefConfig | None = None,
    ) -> Review: ...

    async def create_from_source(
        self,
        host_id: UUID,
        repo_path: str,
        source: ReviewSource,
        brief_config: BriefConfig | None = None,
    ) -> Review: ...

    async def get_or_create_by_mr(
        self,
        host_id: UUID,
        repo_path: str,
        mr_iid: int,
        brief_config: BriefConfig | None = None,
    ) -> Review:
        """Return the review of an MR, creating it first if there is none.

        Atomic: concurrent calls for the same MR all get the same review.
        """
        ...

    async def get_by_id(self, review_id: UUID) -> Review | None: ...

    async def get_by_mr(self, host_id: UUID, repo_path: str, mr_iid: int) -> Review | None: ...

    async def list_all(self) -> list[Review]:
        """The most recently updated reviews, newest first, capped for the history list."""
        ...

    async def list_all_uncapped(self) -> list[Review]:
        """Every stored review, newest first."""
        ...

    async def update_with(self, review_id: UUID, change: Callable[[Review], Review]) -> Review | None:
        """Atomically read the review, apply ``change`` and store the result with a new ``updated_at``.

        Concurrent changes to one review are serialised, so none of them is lost. Returning
        the very object ``change`` was given writes nothing. ``None`` when the review does
        not exist; exceptions raised by ``change`` propagate and nothing is written.
        """
        ...

    async def upsert_with(self, review_id: UUID, change: Callable[[Review | None], Review | None]) -> Review | None:
        """Like :meth:`update_with`, but ``change`` gets ``None`` for a missing review and may create it.

        Returning ``None`` or the object it was given writes nothing. The review is stored
        exactly as returned — timestamps included — which is what an import needs.
        """
        ...

    async def delete(self, review_id: UUID) -> bool: ...
