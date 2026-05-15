from __future__ import annotations

from uuid import UUID

import httpx

from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.vcs.factory import create_vcs_provider


class TestConnectionUseCase:
    def __init__(self, repo: FileHostRepository) -> None:
        self._repo = repo

    async def execute(self, host_id: UUID) -> dict[str, str]:
        host = await self._repo.get_by_id(host_id)
        if host is None:
            raise ValueError(f"Host {host_id} not found")
        async with httpx.AsyncClient(timeout=30) as client:
            provider = create_vcs_provider(host, client)
            return await provider.test_connection()
