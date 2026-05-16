from __future__ import annotations

from uuid import UUID

from mr_review.core.hosts.entities import Host
from mr_review.core.hosts.repositories import HostRepository


class ToggleFavouriteRepoUseCase:
    def __init__(self, repo: HostRepository) -> None:
        self._repo = repo

    async def execute(self, host_id: UUID, repo_path: str) -> Host:
        host = await self._repo.get_by_id(host_id)
        if host is None:
            raise ValueError(f"Host {host_id} not found")

        current = list(host.favourite_repos)
        if repo_path in current:
            current.remove(repo_path)
        else:
            current.append(repo_path)

        updated = await self._repo.set_favourite_repos(host_id, current)
        if updated is None:
            raise ValueError(f"Host {host_id} not found")
        return updated
