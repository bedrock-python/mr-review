from __future__ import annotations

import asyncio
import logging
from uuid import UUID

import httpx
from pydantic import BaseModel

from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.mrs.entities import MR, Repo
from mr_review.infra.vcs.cache import VCSCache
from mr_review.infra.vcs.factory import get_cached_provider

logger = logging.getLogger(__name__)

INBOX_REPO_LIMIT = 20


class InboxMR(BaseModel):
    """MR with its source repo path attached."""

    mr: MR
    repo_path: str


class ListInboxMRsUseCase:
    def __init__(self, host_repo: HostRepository, vcs_cache: VCSCache, vcs_client: httpx.AsyncClient) -> None:
        self._host_repo = host_repo
        self._vcs_cache = vcs_cache
        self._vcs_client = vcs_client

    async def execute(self, host_id: UUID) -> list[InboxMR]:
        host = await self._host_repo.get_by_id(host_id)
        if host is None:
            raise ValueError(f"Host {host_id} not found")

        provider = get_cached_provider(host, self._vcs_client, self._vcs_cache)
        repos: list[Repo] = await provider.list_repos()
        top_repos = repos[:INBOX_REPO_LIMIT]

        async def fetch_mrs(repo: Repo) -> list[InboxMR]:
            try:
                mrs = await provider.list_mrs(repo_path=repo.path, state="opened")
                return [InboxMR(mr=mr, repo_path=repo.path) for mr in mrs]
            except Exception:
                logger.warning("Failed to fetch MRs for repo %s", repo.path, exc_info=True)
                return []

        results = await asyncio.gather(*[fetch_mrs(r) for r in top_repos])

        inbox: list[InboxMR] = []
        for batch in results:
            inbox.extend(batch)
        return inbox
