from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from uuid import UUID, uuid4

from mr_review.core.ai.protocols import AIDispatcherFactory
from mr_review.core.ai_providers.entities import AIProvider
from mr_review.core.ai_providers.repositories import AIProviderRepository
from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.reviews.entities import BriefConfig, Comment, Iteration, IterationStage, Review
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.core.vcs.protocols import VCSProviderFactory
from mr_review.use_cases.reviews.ai_response_parser import ParseResult, parse_ai_response
from mr_review.use_cases.reviews.context_files import (
    CONCURRENCY,
    collect_commit_history,
    collect_context_files,
    collect_full_files,
    collect_related_code,
    collect_test_files,
)
from mr_review.use_cases.reviews.prompt_builder import build_prompt, format_diff

_log = logging.getLogger(__name__)


async def _noop_dict() -> dict[str, str]:
    return {}


async def _noop_commit_history() -> dict[str, list[dict[str, str]]]:
    return {}


class DispatchReviewUseCase:
    def __init__(
        self,
        review_repo: ReviewRepository,
        host_repo: HostRepository,
        ai_provider_repo: AIProviderRepository,
        vcs_factory: VCSProviderFactory,
        ai_dispatcher_factory: AIDispatcherFactory,
    ) -> None:
        self._review_repo = review_repo
        self._host_repo = host_repo
        self._ai_provider_repo = ai_provider_repo
        self._vcs_factory = vcs_factory
        self._ai_dispatcher_factory = ai_dispatcher_factory

    async def execute(
        self,
        review_id: UUID,
        ai_provider_id: UUID,
        model: str | None = None,
        temperature: float | None = None,
        reasoning_budget: int | None = None,
        reasoning_effort: str | None = None,
        iteration_id: UUID | None = None,
    ) -> AsyncIterator[str]:
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        host = await self._host_repo.get_by_id(review.host_id)
        if host is None:
            raise ValueError(f"Host {review.host_id} not found")

        ai_provider = await self._ai_provider_repo.get_by_id(ai_provider_id)
        if ai_provider is None:
            raise ValueError(f"AI provider {ai_provider_id} not found")

        # Resolve or create the iteration to dispatch into
        iteration, review = await self._resolve_iteration(review, iteration_id, ai_provider_id, model)

        provider = self._vcs_factory(host)
        mr = await provider.get_mr(repo_path=review.repo_path, mr_iid=review.mr_iid)
        diff_files = await provider.get_diff(repo_path=review.repo_path, mr_iid=review.mr_iid)
        cfg = iteration.brief_config
        ref = mr.source_branch

        semaphore = asyncio.Semaphore(CONCURRENCY)

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

        diff_text = format_diff(diff_files)
        prompt = build_prompt(
            cfg,
            diff_text,
            mr.title,
            mr.description,
            context_contents,
            full_files=full_files,
            test_files=test_files,
            related_code=related_code,
            commit_history=commit_history,
        )

        return self._stream_and_save(
            review_id=review_id,
            iteration_id=iteration.id,
            prompt=prompt,
            ai_provider=ai_provider,
            model=model,
            temperature=temperature,
            reasoning_budget=reasoning_budget,
            reasoning_effort=reasoning_effort,
        )

    async def _resolve_iteration(
        self,
        review: Review,
        iteration_id: UUID | None,
        ai_provider_id: UUID,
        model: str | None,
    ) -> tuple[Iteration, Review]:
        """Return the iteration to dispatch into, creating one if needed, and the updated review."""
        if iteration_id is not None:
            return await self._redispatch_by_id(review, iteration_id, ai_provider_id, model)

        # Reuse the last incomplete iteration if it is not yet in post stage
        last = review.iterations[-1] if review.iterations else None
        if last is not None and last.completed_at is None and last.stage != IterationStage.post:
            return await self._redispatch_last(review, last, ai_provider_id, model)

        # Create a new iteration
        return await self._create_iteration(review, ai_provider_id, model)

    async def _redispatch_by_id(
        self,
        review: Review,
        iteration_id: UUID,
        ai_provider_id: UUID,
        model: str | None,
    ) -> tuple[Iteration, Review]:
        idx = next((i for i, it in enumerate(review.iterations) if it.id == iteration_id), None)
        if idx is None:
            raise ValueError(f"Iteration {iteration_id} not found on review {review.id}")
        iteration = review.iterations[idx]
        if iteration.completed_at is not None:
            raise ValueError(f"Iteration {iteration_id} is already completed and cannot be re-dispatched")
        if iteration.stage == IterationStage.post:
            raise ValueError(f"Iteration {iteration_id} is in stage 'post' and cannot be re-dispatched")
        if iteration.comments:
            _log.warning(
                "Re-dispatching iteration %s on review %s — clearing %d existing comments",
                iteration_id,
                review.id,
                len(iteration.comments),
            )
        return await self._save_dispatching(review, idx, iteration, ai_provider_id, model)

    async def _redispatch_last(
        self,
        review: Review,
        last: Iteration,
        ai_provider_id: UUID,
        model: str | None,
    ) -> tuple[Iteration, Review]:
        idx = len(review.iterations) - 1
        if last.comments:
            _log.warning(
                "Re-dispatching last iteration %s on review %s — clearing %d existing comments",
                last.id,
                review.id,
                len(last.comments),
            )
        return await self._save_dispatching(review, idx, last, ai_provider_id, model)

    async def _save_dispatching(
        self,
        review: Review,
        idx: int,
        iteration: Iteration,
        ai_provider_id: UUID,
        model: str | None,
    ) -> tuple[Iteration, Review]:
        dispatching = iteration.model_copy(
            update={
                "stage": IterationStage.dispatch,
                "ai_provider_id": ai_provider_id,
                "model": model,
                "comments": [],
            }
        )
        new_iterations = list(review.iterations)
        new_iterations[idx] = dispatching
        updated_review = await self._review_repo.update(review.model_copy(update={"iterations": new_iterations}))
        return dispatching, updated_review

    async def _create_iteration(
        self,
        review: Review,
        ai_provider_id: UUID,
        model: str | None,
    ) -> tuple[Iteration, Review]:
        number = max((it.number for it in review.iterations), default=0) + 1
        iteration = Iteration(
            id=uuid4(),
            number=number,
            stage=IterationStage.dispatch,
            comments=[],
            ai_provider_id=ai_provider_id,
            model=model,
            brief_config=review.iterations[-1].brief_config if review.iterations else BriefConfig(),
            created_at=datetime.now(timezone.utc),
            completed_at=None,
        )
        new_iterations = list(review.iterations) + [iteration]
        updated_review = await self._review_repo.update(review.model_copy(update={"iterations": new_iterations}))
        return iteration, updated_review

    async def _stream_and_save(
        self,
        review_id: UUID,
        iteration_id: UUID,
        prompt: str,
        ai_provider: AIProvider,
        model: str | None = None,
        temperature: float | None = None,
        reasoning_budget: int | None = None,
        reasoning_effort: str | None = None,
    ) -> AsyncIterator[str]:
        stream = await self._ai_dispatcher_factory(
            ai_provider, prompt, model, temperature, reasoning_budget, reasoning_effort
        )
        accumulated = ""
        try:
            async for chunk in stream:
                accumulated += chunk
                yield chunk
        finally:
            await self._persist_ai_response(review_id, iteration_id, accumulated)

    async def _persist_ai_response(self, review_id: UUID, iteration_id: UUID, raw: str) -> None:
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            _log.warning("Review %s not found during persistence — response lost", review_id)
            return

        idx = next((i for i, it in enumerate(review.iterations) if it.id == iteration_id), None)
        if idx is None:
            _log.warning(
                "Iteration %s not found on review %s during persistence — response lost",
                iteration_id,
                review_id,
            )
            return

        result: ParseResult = parse_ai_response(raw)
        if result.json_error is not None:
            fallback = Comment(id=uuid4(), file=None, line=None, severity="suggestion", body=raw.strip())
            comments = [fallback]
        else:
            comments = result.comments

        updated_iteration = review.iterations[idx].model_copy(
            update={"stage": IterationStage.polish, "comments": comments}
        )
        new_iterations = list(review.iterations)
        new_iterations[idx] = updated_iteration
        await self._review_repo.update(review.model_copy(update={"iterations": new_iterations}))
