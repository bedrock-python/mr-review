from __future__ import annotations

from uuid import UUID

from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.mrs.entities import MR, MRStateFilter
from mr_review.core.pagination import DEFAULT_MRS_PER_PAGE, Page
from mr_review.core.vcs.protocols import VCSProviderFactory


class ListMRsUseCase:
    def __init__(self, host_repo: HostRepository, vcs_factory: VCSProviderFactory) -> None:
        self._host_repo = host_repo
        self._vcs_factory = vcs_factory

    async def execute(
        self,
        host_id: UUID,
        repo_path: str,
        state: MRStateFilter = "opened",
        page: int = 1,
        per_page: int = DEFAULT_MRS_PER_PAGE,
        query: str | None = None,
    ) -> Page[MR]:
        host = await self._host_repo.get_by_id(host_id)
        if host is None:
            raise ValueError(f"Host {host_id} not found")
        provider = self._vcs_factory(host)
        return await provider.list_mrs(repo_path=repo_path, state=state, page=page, per_page=per_page, query=query)
