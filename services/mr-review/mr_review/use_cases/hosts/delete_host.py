from __future__ import annotations

from uuid import UUID

from mr_review.core.hosts.repositories import HostRepository


class DeleteHostUseCase:
    def __init__(self, repo: HostRepository) -> None:
        self._repo = repo

    async def execute(self, host_id: UUID) -> bool:
        return await self._repo.delete(host_id)
