from __future__ import annotations

from uuid import UUID

from mr_review.core.hosts.entities import Host
from mr_review.infra.repositories.host import FileHostRepository


class UpdateHostUseCase:
    def __init__(self, repo: FileHostRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        host_id: UUID,
        name: str | None = None,
        base_url: str | None = None,
        token: str | None = None,
    ) -> Host | None:
        return await self._repo.update(host_id, name=name, base_url=base_url, token=token)
