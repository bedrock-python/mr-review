from __future__ import annotations

from uuid import UUID

import httpx

from mr_review.core.mrs.entities import DiffFile
from mr_review.infra.repositories.host import SQLiteHostRepository
from mr_review.infra.vcs.factory import create_vcs_provider


class GetMRDiffUseCase:
    def __init__(self, host_repo: SQLiteHostRepository) -> None:
        self._host_repo = host_repo

    async def execute(self, host_id: UUID, repo_path: str, mr_iid: int) -> list[DiffFile]:
        host = await self._host_repo.get_by_id(host_id)
        if host is None:
            raise ValueError(f"Host {host_id} not found")
        async with httpx.AsyncClient(timeout=60) as client:
            provider = create_vcs_provider(host, client)
            return await provider.get_diff(repo_path=repo_path, mr_iid=mr_iid)
