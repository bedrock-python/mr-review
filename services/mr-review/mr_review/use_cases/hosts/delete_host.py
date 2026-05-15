from __future__ import annotations

from uuid import UUID

from mr_review.infra.repositories.host import FileHostRepository


class DeleteHostUseCase:
    def __init__(self, repo: FileHostRepository) -> None:
        self._repo = repo

    async def execute(self, host_id: UUID) -> bool:
        return await self._repo.delete(host_id)
