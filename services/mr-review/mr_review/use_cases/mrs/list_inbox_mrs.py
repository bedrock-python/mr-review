from __future__ import annotations

import asyncio
import logging
from uuid import UUID

from mr_review.core.hosts.entities import Host
from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.mrs.entities import InboxMR, InboxMRPage, InboxScope
from mr_review.core.pagination import DEFAULT_MRS_PER_PAGE
from mr_review.core.vcs.protocols import VCSProvider, VCSProviderFactory

logger = logging.getLogger(__name__)

# scope=all: each inbox page covers this many repositories (most recently active first)...
INBOX_REPO_BATCH = 10
# ...queried at most this many at a time...
INBOX_FETCH_CONCURRENCY = 5
# ...each contributing at most this many of its newest open MRs (fewer when per_page is smaller).
INBOX_MRS_PER_REPO = 10


class ListInboxMRsUseCase:
    def __init__(self, host_repo: HostRepository, vcs_factory: VCSProviderFactory) -> None:
        self._host_repo = host_repo
        self._vcs_factory = vcs_factory

    async def execute(
        self,
        host_id: UUID,
        scope: InboxScope = "all",
        page: int = 1,
        per_page: int = DEFAULT_MRS_PER_PAGE,
    ) -> InboxMRPage:
        """One page of open MRs for the inbox, newest update first within the page.

        ``authored`` / ``assigned`` / ``review_requested`` are answered by the host's own
        per-user listing. ``all`` walks the user's repositories by recent activity: page N
        covers the N-th batch of ``INBOX_REPO_BATCH`` repositories and takes the newest
        ``min(per_page, INBOX_MRS_PER_REPO)`` open MRs of each, naming the repositories that had
        more in ``truncated_repos``; ``has_more`` means more repositories remain.
        """
        host = await self._host_repo.get_by_id(host_id)
        if host is None:
            raise ValueError(f"Host {host_id} not found")
        provider = self._vcs_factory(host)

        if scope == "all":
            return await _across_repositories(provider, host, page, per_page)
        result = await provider.list_my_mrs(scope, page=page, per_page=per_page)
        return InboxMRPage(items=_newest_first(result.items), page=page, per_page=per_page, has_more=result.has_more)


async def _across_repositories(provider: VCSProvider, host: Host, page: int, per_page: int) -> InboxMRPage:
    repos = await provider.list_repos(page=page, per_page=INBOX_REPO_BATCH)
    listed = [repo.path for repo in repos.items]
    if page == 1:
        # Pinned favourites the membership listing may not include ride along on the first page.
        paths = [*(p for p in host.favourite_repos if p not in listed), *listed]
    else:
        # ...and are skipped later, so their MRs appear exactly once.
        favourites = set(host.favourite_repos)
        paths = [p for p in listed if p not in favourites]

    semaphore = asyncio.Semaphore(INBOX_FETCH_CONCURRENCY)
    per_repo = min(per_page, INBOX_MRS_PER_REPO)
    truncated: list[str] = []

    async def open_mrs(repo_path: str) -> list[InboxMR]:
        async with semaphore:
            try:
                mrs = await provider.list_mrs(repo_path=repo_path, state="opened", page=1, per_page=per_repo)
            except Exception:
                logger.warning("Failed to fetch MRs for repo %s", repo_path, exc_info=True)
                return []
        if mrs.has_more:
            truncated.append(repo_path)
        return [InboxMR(mr=mr, repo_path=repo_path) for mr in mrs.items]

    batches = await asyncio.gather(*[open_mrs(path) for path in paths])
    items = [item for batch in batches for item in batch]
    return InboxMRPage(
        items=_newest_first(items),
        page=page,
        per_page=per_page,
        has_more=repos.has_more,
        # In listing order, not completion order.
        truncated_repos=[path for path in paths if path in truncated],
    )


def _newest_first(items: list[InboxMR]) -> list[InboxMR]:
    return sorted(items, key=lambda item: item.mr.updated_at, reverse=True)
