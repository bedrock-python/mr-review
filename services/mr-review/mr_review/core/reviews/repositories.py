from __future__ import annotations

from typing import Protocol
from uuid import UUID

from mr_review.core.reviews.entities import BriefConfig, Review
from mr_review.core.reviews.sources import ReviewSource


class ReviewRepository(Protocol):
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

    async def get_by_id(self, review_id: UUID) -> Review | None: ...

    async def get_by_mr(self, host_id: UUID, repo_path: str, mr_iid: int) -> Review | None: ...

    async def list_all(self) -> list[Review]: ...

    async def update(self, review: Review) -> Review: ...

    async def delete(self, review_id: UUID) -> bool: ...
