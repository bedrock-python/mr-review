from __future__ import annotations

from uuid import UUID

from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.vcs.protocols import VCSCacheInvalidator


class DeleteHostUseCase:
    def __init__(self, repo: HostRepository, vcs_cache: VCSCacheInvalidator) -> None:
        self._repo = repo
        self._vcs_cache = vcs_cache

    async def execute(self, host_id: UUID) -> bool:
        deleted = await self._repo.delete(host_id)
        if deleted:
            self._vcs_cache.invalidate(host_id)
        return deleted
