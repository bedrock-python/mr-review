from __future__ import annotations

import asyncio
from uuid import UUID

import httpx

from mr_review.core.reviews.entities import BriefConfig, Review
from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.repositories.review import FileReviewRepository
from mr_review.infra.vcs.cache import VCSCache
from mr_review.infra.vcs.factory import get_cached_provider
from mr_review.use_cases.reviews.context_files import (
    _CONCURRENCY,
    collect_commit_history,
    collect_context_files,
    collect_full_files,
    collect_related_code,
    collect_test_files,
)
from mr_review.use_cases.reviews.dispatch_review import _build_prompt, _format_diff


class GetReviewPromptUseCase:
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

    async def execute(
        self,
        review_id: UUID,
        *,
        brief_config: BriefConfig | None = None,
        iteration_id: UUID | None = None,
    ) -> str:
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        host = await self._host_repo.get_by_id(review.host_id)
        if host is None:
            raise ValueError(f"Host {review.host_id} not found")

        brief_config = brief_config or self._resolve_brief_config(review, review_id, iteration_id)

        provider = get_cached_provider(host, self._vcs_client, self._vcs_cache)
        mr = await provider.get_mr(repo_path=review.repo_path, mr_iid=review.mr_iid)
        diff_files = await provider.get_diff(repo_path=review.repo_path, mr_iid=review.mr_iid)
        cfg = brief_config
        ref = mr.source_branch

        semaphore = asyncio.Semaphore(_CONCURRENCY)

        async def _noop_dict() -> dict[str, str]:
            return {}

        async def _noop_commit_history() -> dict[str, list[dict[str, str]]]:
            return {}

        context_contents, full_files, test_files, related_code, commit_history = await asyncio.gather(
            collect_context_files(
                provider=provider,
                repo_path=review.repo_path,
                requested_paths=cfg.context_files,
                ref=ref,
                semaphore=semaphore,
            )
            if cfg.include_context
            else _noop_dict(),
            collect_full_files(provider, review.repo_path, diff_files, ref, semaphore)
            if cfg.include_full_files
            else _noop_dict(),
            collect_test_files(provider, review.repo_path, diff_files, ref, semaphore)
            if cfg.include_test_context
            else _noop_dict(),
            collect_related_code(provider, review.repo_path, diff_files, ref, semaphore)
            if cfg.include_related_code
            else _noop_dict(),
            collect_commit_history(provider, review.repo_path, diff_files, ref, semaphore)
            if cfg.include_commit_history
            else _noop_commit_history(),
        )

        return _build_prompt(
            brief_config,
            _format_diff(diff_files),
            mr.title,
            mr.description,
            context_contents if context_contents else None,
            full_files=full_files,
            test_files=test_files,
            related_code=related_code,
            commit_history=commit_history,
        )

    def _resolve_brief_config(self, review: Review, review_id: UUID, iteration_id: UUID | None) -> BriefConfig:
        if iteration_id is None:
            return review.brief_config
        iteration = next((it for it in review.iterations if it.id == iteration_id), None)
        if iteration is None:
            raise ValueError(f"Iteration {iteration_id} not found on review {review_id}")
        return iteration.brief_config
