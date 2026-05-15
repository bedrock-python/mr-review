from __future__ import annotations

from mr_review.core.hosts.entities import Host
from mr_review.infra.repositories.host import SQLiteHostRepository


class ListHostsUseCase:
    def __init__(self, repo: SQLiteHostRepository) -> None:
        self._repo = repo

    async def execute(self) -> list[Host]:
        return await self._repo.list_all()
