from __future__ import annotations

from uuid import UUID

from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.mrs.entities import Repo
from mr_review.core.vcs.protocols import VCSProviderFactory
from mr_review.use_cases.mrs._favourite_repos import fetch_extra_favourites


class ListReposUseCase:
    def __init__(self, host_repo: HostRepository, vcs_factory: VCSProviderFactory) -> None:
        self._host_repo = host_repo
        self._vcs_factory = vcs_factory

    async def execute(self, host_id: UUID, query: str | None = None) -> list[Repo]:
        host = await self._host_repo.get_by_id(host_id)
        if host is None:
            raise ValueError(f"Host {host_id} not found")
        provider = self._vcs_factory(host)
        listed = await provider.list_repos(query=query)
        extras = await fetch_extra_favourites(provider, host, listed, query)
        if not extras:
            return listed
        return [*extras, *listed]
