from __future__ import annotations

from uuid import UUID

import httpx

from mr_review.core.mrs.entities import MR
from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.vcs.cache import VCSCache
from mr_review.infra.vcs.factory import get_cached_provider


class ListMRsUseCase:
    def __init__(self, host_repo: FileHostRepository, vcs_cache: VCSCache, vcs_client: httpx.AsyncClient) -> None:
        self._host_repo = host_repo
        self._vcs_cache = vcs_cache
        self._vcs_client = vcs_client

    async def execute(self, host_id: UUID, repo_path: str, state: str = "opened") -> list[MR]:
        host = await self._host_repo.get_by_id(host_id)
        if host is None:
            raise ValueError(f"Host {host_id} not found")
        provider = get_cached_provider(host, self._vcs_client, self._vcs_cache)
        return await provider.list_mrs(repo_path=repo_path, state=state)
