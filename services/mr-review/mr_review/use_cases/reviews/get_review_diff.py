from uuid import UUID

import httpx

from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.repositories.review import FileReviewRepository
from mr_review.infra.vcs.cache import VCSCache
from mr_review.infra.vcs.factory import get_cached_provider
from mr_review.use_cases.reviews.dispatch_review import _format_diff


class GetReviewDiffUseCase:
    def __init__(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
        vcs_cache: VCSCache,
        vcs_client: httpx.AsyncClient,
    ) -> None:
        self._review_repo = review_repo
        self._host_repo = host_repo
        self._vcs_cache = vcs_cache
        self._vcs_client = vcs_client

    async def execute(self, review_id: UUID) -> str:
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        host = await self._host_repo.get_by_id(review.host_id)
        if host is None:
            raise ValueError(f"Host {review.host_id} not found")

        provider = get_cached_provider(host, self._vcs_client, self._vcs_cache)
        diff_files = await provider.get_diff(repo_path=review.repo_path, mr_iid=review.mr_iid)
        return _format_diff(diff_files)
