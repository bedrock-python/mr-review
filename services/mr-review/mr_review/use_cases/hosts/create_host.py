from __future__ import annotations

from mr_review.core.hosts.entities import Host
from mr_review.core.hosts.repositories import HostRepository


class CreateHostUseCase:
    def __init__(self, repo: HostRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        name: str,
        type_: str,
        base_url: str,
        token: str,
        color: str | None = None,
        timeout: int = 30,
    ) -> Host:
        return await self._repo.create(
            name=name, type_=type_, base_url=base_url, token=token, color=color, timeout=timeout
        )
