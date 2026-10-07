from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncGenerator, AsyncIterator
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID, uuid4

import anyio

from mr_review.core.ai.protocols import AIDispatcherFactory
from mr_review.core.ai_providers.entities import AIProvider
from mr_review.core.ai_providers.repositories import AIProviderRepository
from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.reviews.entities import BriefConfig, Iteration, IterationStage, Review
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.core.vcs.protocols import VCSProviderFactory
from mr_review.use_cases.reviews.ai_response_parser import ParsedComment, StreamingCommentParser, parse_ai_response
from mr_review.use_cases.reviews.context_files import (
    CONCURRENCY,
    collect_commit_history,
    collect_context_files,
    collect_full_files,
    collect_related_code,
    collect_test_files,
)
from mr_review.use_cases.reviews.prompt_builder import build_prompt, format_diff
from mr_review.use_cases.reviews.source_resolver import resolve_source

_log = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class DispatchChunk:
    """A piece of the model's answer, as it arrived."""

    text: str


@dataclass(frozen=True, slots=True)
class DispatchCommentPreview:
    """A comment object that has just completed in the stream; ids are assigned when it is stored."""

    index: int
    comment: ParsedComment


@dataclass(frozen=True, slots=True)
class DispatchCompleted:
    """The whole answer has been parsed and stored on the iteration."""

    iteration_id: UUID
    comments: int
    errors: int
    json_error: str | None
    truncated: bool


DispatchEvent = DispatchChunk | DispatchCommentPreview | DispatchCompleted


async def _noop_dict() -> dict[str, str]:
    return {}


async def _noop_commit_history() -> dict[str, list[dict[str, str]]]:
    return {}


async def _close_stream(stream: AsyncIterator[str]) -> None:
    """Release the provider's connection and concurrency slot when the stream is abandoned early."""
    if not isinstance(stream, AsyncGenerator):
        return
    try:
        await stream.aclose()
    except Exception:
        _log.warning("Closing an abandoned AI response stream failed", exc_info=True)


def _iteration_index(review: Review, iteration_id: UUID) -> int | None:
    return next((i for i, it in enumerate(review.iterations) if it.id == iteration_id), None)


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
    ) -> AsyncIterator[DispatchEvent]:
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        host = await self._host_repo.get_by_id(review.host_id)
        if host is None:
            raise ValueError(f"Host {review.host_id} not found")

        ai_provider = await self._ai_provider_repo.get_by_id(ai_provider_id)
        if ai_provider is None:
            raise ValueError(f"AI provider {ai_provider_id} not found")

        # Resolve or create the iteration to dispatch into; it is written once the prompt is ready.
        previous = self._reusable_iteration(review, iteration_id)
        iteration = self._dispatching_iteration(review, previous, ai_provider_id, model)

        provider = self._vcs_factory(host)
        resolved = await resolve_source(review, provider)
        diff_files = resolved.diff_files
        cfg = iteration.brief_config
        ref = resolved.ref

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
            resolved.title,
            resolved.description,
            context_contents,
            full_files=full_files,
            test_files=test_files,
            related_code=related_code,
            commit_history=commit_history,
        )

        await self._put_iteration(review, iteration)
        return self._stream_and_save(
            review_id=review_id,
            iteration_id=iteration.id,
            prompt=prompt,
            ai_provider=ai_provider,
            model=model,
            temperature=temperature,
            reasoning_budget=reasoning_budget,
            reasoning_effort=reasoning_effort,
            restore_on_failure=previous,
        )

    @staticmethod
    def _reusable_iteration(review: Review, iteration_id: UUID | None) -> Iteration | None:
        """The existing iteration to dispatch into, or ``None`` when a new one is needed."""
        if iteration_id is None:
            # Reuse the last incomplete iteration if it is not yet in post stage
            last = review.iterations[-1] if review.iterations else None
            if last is not None and last.completed_at is None and last.stage != IterationStage.post:
                return last
            return None

        index = _iteration_index(review, iteration_id)
        if index is None:
            raise ValueError(f"Iteration {iteration_id} not found on review {review.id}")
        iteration = review.iterations[index]
        if iteration.completed_at is not None:
            raise ValueError(f"Iteration {iteration_id} is already completed and cannot be re-dispatched")
        if iteration.stage == IterationStage.post:
            raise ValueError(f"Iteration {iteration_id} is in stage 'post' and cannot be re-dispatched")
        return iteration

    @staticmethod
    def _dispatching_iteration(
        review: Review,
        previous: Iteration | None,
        ai_provider_id: UUID,
        model: str | None,
    ) -> Iteration:
        # Existing comments stay until the new answer is stored: a dispatch that fails or is
        # abandoned before producing anything must not cost the user the comments they had.
        if previous is not None:
            return previous.model_copy(
                update={"stage": IterationStage.dispatch, "ai_provider_id": ai_provider_id, "model": model}
            )
        return Iteration(
            id=uuid4(),
            number=max((it.number for it in review.iterations), default=0) + 1,
            stage=IterationStage.dispatch,
            comments=[],
            ai_provider_id=ai_provider_id,
            model=model,
            brief_config=review.iterations[-1].brief_config if review.iterations else BriefConfig(),
            created_at=datetime.now(timezone.utc),
            completed_at=None,
        )

    async def _put_iteration(self, review: Review, iteration: Iteration) -> None:
        index = _iteration_index(review, iteration.id)
        iterations = list(review.iterations)
        if index is None:
            iterations.append(iteration)
        else:
            iterations[index] = iteration
        await self._review_repo.update(review.model_copy(update={"iterations": iterations}))

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
        restore_on_failure: Iteration | None = None,
    ) -> AsyncGenerator[DispatchEvent, None]:
        """Relay the model's answer, preview comments as they complete, then store the result.

        ``DispatchCompleted`` comes last and only after the iteration has been written. If the
        provider fails or the client goes away, whatever arrived is still stored — shielded from
        the cancellation that a disconnect delivers — and the exception propagates.
        """
        stream = await self._ai_dispatcher_factory(
            ai_provider, prompt, model, temperature, reasoning_budget, reasoning_effort
        )
        parts: list[str] = []
        preview = StreamingCommentParser()
        emitted = 0
        try:
            async for chunk in stream:
                if not chunk:
                    continue
                parts.append(chunk)
                yield DispatchChunk(text=chunk)
                for comment in preview.feed(chunk):
                    yield DispatchCommentPreview(index=emitted, comment=comment)
                    emitted += 1
        except BaseException:
            with anyio.CancelScope(shield=True):
                await _close_stream(stream)
                await self._save_interrupted(review_id, iteration_id, "".join(parts), restore_on_failure)
            raise

        with anyio.CancelScope(shield=True):
            completed = await self._persist_ai_response(review_id, iteration_id, "".join(parts))
        if completed is None:
            raise ValueError(f"Review {review_id} or its iteration was deleted while the answer was streaming")
        yield completed

    async def _load_iteration(self, review_id: UUID, iteration_id: UUID) -> tuple[Review, int] | None:
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            _log.warning("Review %s not found during persistence — response lost", review_id)
            return None
        index = _iteration_index(review, iteration_id)
        if index is None:
            _log.warning(
                "Iteration %s not found on review %s during persistence — response lost",
                iteration_id,
                review_id,
            )
            return None
        return review, index

    async def _replace_iteration(self, review: Review, index: int, iteration: Iteration) -> None:
        iterations = list(review.iterations)
        iterations[index] = iteration
        await self._review_repo.update(review.model_copy(update={"iterations": iterations}))

    async def _persist_ai_response(self, review_id: UUID, iteration_id: UUID, raw: str) -> DispatchCompleted | None:
        """Store a complete answer: its comments replace the iteration's, or one general comment
        holds the text when nothing in it parses. ``None`` when the review or iteration is gone."""
        result = await asyncio.to_thread(parse_ai_response, raw)
        loaded = await self._load_iteration(review_id, iteration_id)
        if loaded is None:
            return None
        review, index = loaded
        comments = result.comments_to_store()
        updated = review.iterations[index].model_copy(
            update={"stage": IterationStage.polish, "comments": comments, "raw_response": raw}
        )
        await self._replace_iteration(review, index, updated)
        return DispatchCompleted(
            iteration_id=iteration_id,
            comments=len(comments),
            errors=len(result.errors),
            json_error=result.json_error,
            truncated=result.truncated,
        )

    async def _save_interrupted(self, review_id: UUID, iteration_id: UUID, raw: str, restore: Iteration | None) -> None:
        """Store what an interrupted dispatch produced without ever making things worse.

        Complete comments salvaged from the partial answer replace the old ones. Otherwise the old
        comments stay, the iteration goes back to the stage, provider and model it had before
        (a new one stays in ``dispatch``), and the partial text is kept as the raw response.
        """
        try:
            result = await asyncio.to_thread(parse_ai_response, raw) if raw.strip() else None
            loaded = await self._load_iteration(review_id, iteration_id)
            if loaded is None:
                return
            review, index = loaded
            current = review.iterations[index]
            if result is not None and result.comments:
                update: dict[str, object] = {
                    "stage": IterationStage.polish,
                    "comments": result.comments,
                    "raw_response": raw,
                }
            else:
                update = {"raw_response": raw if raw.strip() else current.raw_response}
                if restore is not None:
                    update |= {"stage": restore.stage, "ai_provider_id": restore.ai_provider_id, "model": restore.model}
            await self._replace_iteration(review, index, current.model_copy(update=update))
        except Exception:
            _log.exception("Failed to store the interrupted answer for iteration %s", iteration_id)
