from __future__ import annotations

from uuid import UUID

from mr_review.core.hosts.entities import Host
from mr_review.core.hosts.repositories import HostRepository


class UpdateHostUseCase:
    def __init__(self, repo: HostRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        host_id: UUID,
        name: str | None = None,
        base_url: str | None = None,
        token: str | None = None,
        color: str | None = None,
        timeout: int | None = None,
    ) -> Host | None:
        return await self._repo.update(host_id, name=name, base_url=base_url, token=token, color=color, timeout=timeout)
