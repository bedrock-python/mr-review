from __future__ import annotations

from uuid import UUID

from mr_review.core.hosts.entities import Host
from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.mrs.entities import Repo
from mr_review.core.vcs.protocols import VCSProviderFactory
from mr_review.core.vcs.url_parser import parse_repo_url


class AddRepoByUrlUseCase:
    """Resolve a user-supplied URL/path to a repo, validate it on the VCS, then pin it as a favourite.

    Pinning makes the repo visible in the sidebar even when the host token's
    membership-based listing does not include it (e.g. public OSS repos).
    """

    def __init__(self, host_repo: HostRepository, vcs_factory: VCSProviderFactory) -> None:
        self._host_repo = host_repo
        self._vcs_factory = vcs_factory

    async def execute(self, host_id: UUID, url_or_path: str) -> tuple[Host, Repo]:
        host = await self._host_repo.get_by_id(host_id)
        if host is None:
            raise ValueError(f"Host {host_id} not found")

        repo_path = parse_repo_url(url_or_path, host.type)

        provider = self._vcs_factory(host)
        repo = await provider.get_repo(repo_path)

        favourites = list(host.favourite_repos)
        if repo.path not in favourites:
            favourites.append(repo.path)
            updated = await self._host_repo.set_favourite_repos(host_id, favourites)
            if updated is None:
                raise ValueError(f"Host {host_id} not found")
            host = updated

        return host, repo
