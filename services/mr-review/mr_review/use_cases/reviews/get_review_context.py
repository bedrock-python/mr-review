from uuid import UUID

import httpx

from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.infra.vcs.cache import VCSCache
from mr_review.infra.vcs.factory import get_cached_provider
from mr_review.use_cases.reviews.context_files import CONTEXT_EMBED_CHARS, collect_context_files, merge_context


class GetReviewContextUseCase:
    def __init__(
        self,
        review_repo: ReviewRepository,
        host_repo: HostRepository,
        vcs_cache: VCSCache,
        vcs_client: httpx.AsyncClient,
    ) -> None:
        self._review_repo = review_repo
        self._host_repo = host_repo
        self._vcs_cache = vcs_cache
        self._vcs_client = vcs_client

    async def execute(self, review_id: UUID) -> tuple[str, bool]:
        """Return (merged_context_md, is_large).

        is_large is True when total chars >= CONTEXT_EMBED_CHARS.
        """
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        host = await self._host_repo.get_by_id(review.host_id)
        if host is None:
            raise ValueError(f"Host {review.host_id} not found")

        provider = get_cached_provider(host, self._vcs_client, self._vcs_cache)
        mr = await provider.get_mr(repo_path=review.repo_path, mr_iid=review.mr_iid)
        context_contents = await collect_context_files(
            provider=provider,
            repo_path=review.repo_path,
            requested_paths=review.brief_config.context_files,
            ref=mr.source_branch,
        )

        merged = merge_context(context_contents)
        is_large = len(merged) >= CONTEXT_EMBED_CHARS
        return merged, is_large
