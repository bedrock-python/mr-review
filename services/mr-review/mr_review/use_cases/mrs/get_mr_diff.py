from __future__ import annotations

from uuid import UUID

from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.mrs.entities import DiffFile
from mr_review.core.vcs.protocols import VCSProviderFactory


class GetMRDiffUseCase:
    def __init__(self, host_repo: HostRepository, vcs_factory: VCSProviderFactory) -> None:
        self._host_repo = host_repo
        self._vcs_factory = vcs_factory

    async def execute(self, host_id: UUID, repo_path: str, mr_iid: int) -> list[DiffFile]:
        host = await self._host_repo.get_by_id(host_id)
        if host is None:
            raise ValueError(f"Host {host_id} not found")
        provider = self._vcs_factory(host)
        return await provider.get_diff(repo_path=repo_path, mr_iid=mr_iid)
