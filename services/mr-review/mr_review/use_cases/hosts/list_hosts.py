from __future__ import annotations

from mr_review.core.hosts.entities import Host
from mr_review.infra.repositories.host import FileHostRepository


class ListHostsUseCase:
    def __init__(self, repo: FileHostRepository) -> None:
        self._repo = repo

    async def execute(self) -> list[Host]:
        return await self._repo.list_all()
