from __future__ import annotations

from uuid import UUID

from mr_review.core.hosts.entities import Host
from mr_review.core.hosts.repositories import HostRepository


class ToggleFavouriteRepoUseCase:
    def __init__(self, repo: HostRepository) -> None:
        self._repo = repo

    async def execute(self, host_id: UUID, repo_path: str) -> Host:
        def _toggle(host: Host) -> Host:
            favourites = list(host.favourite_repos)
            if repo_path in favourites:
                favourites.remove(repo_path)
            else:
                favourites.append(repo_path)
            return host.model_copy(update={"favourite_repos": favourites})

        # The toggle runs against the stored list under the repository's lock, so
        # concurrent toggles of different repositories never overwrite each other.
        updated = await self._repo.update_with(host_id, _toggle)
        if updated is None:
            raise ValueError(f"Host {host_id} not found")
        return updated
