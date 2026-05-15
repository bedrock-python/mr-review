from __future__ import annotations

from mr_review.core.hosts.entities import Host
from mr_review.infra.repositories.host import FileHostRepository


class CreateHostUseCase:
    def __init__(self, repo: FileHostRepository) -> None:
        self._repo = repo

    async def execute(self, name: str, type_: str, base_url: str, token: str) -> Host:
        return await self._repo.create(name=name, type_=type_, base_url=base_url, token=token)
