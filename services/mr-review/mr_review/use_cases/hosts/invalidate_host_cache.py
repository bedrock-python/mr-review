from __future__ import annotations

from uuid import UUID

from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.vcs.protocols import VCSCacheInvalidator


class InvalidateHostCacheUseCase:
    """Drop cached VCS responses for a host, e.g. after a push the cache hasn't seen yet."""

    def __init__(self, host_repo: HostRepository, vcs_cache: VCSCacheInvalidator) -> None:
        self._host_repo = host_repo
        self._vcs_cache = vcs_cache

    async def execute(self, host_id: UUID, repo_path: str | None = None) -> None:
        """Without ``repo_path`` the host's whole cache goes; with it, only that repository's entries."""
        if await self._host_repo.get_by_id(host_id) is None:
            raise ValueError(f"Host {host_id} not found")
        self._vcs_cache.invalidate(host_id, repo_path)
