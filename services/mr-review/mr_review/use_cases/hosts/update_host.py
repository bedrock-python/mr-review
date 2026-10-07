from __future__ import annotations

from uuid import UUID

from mr_review.core.hosts.entities import Host
from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.vcs.protocols import VCSCacheInvalidator


class UpdateHostUseCase:
    def __init__(self, repo: HostRepository, vcs_cache: VCSCacheInvalidator) -> None:
        self._repo = repo
        self._vcs_cache = vcs_cache

    async def execute(
        self,
        host_id: UUID,
        name: str | None = None,
        base_url: str | None = None,
        token: str | None = None,
        color: str | None = None,
        timeout: int | None = None,
    ) -> Host | None:
        host = await self._repo.update(host_id, name=name, base_url=base_url, token=token, color=color, timeout=timeout)
        if host is not None:
            self._vcs_cache.invalidate(host_id)
        return host
