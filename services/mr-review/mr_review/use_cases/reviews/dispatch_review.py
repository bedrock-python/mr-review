from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncGenerator, AsyncIterator
from dataclasses import dataclass, replace
from datetime import datetime, timezone
from functools import partial
from uuid import UUID, uuid4

import anyio

from mr_review.core.ai.entities import AIStreamEnd, AIStreamItem, DispatchOptions
from mr_review.core.ai.protocols import AIDispatcherFactory
from mr_review.core.ai_providers.entities import AIProvider
from mr_review.core.ai_providers.repositories import AIProviderRepository
from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.reviews.entities import BriefConfig, Iteration, IterationStage, Review
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.core.vcs.protocols import VCSProviderFactory
from mr_review.use_cases.reviews._answer_settlement import DispatchBaseline, SettledAnswer, settle_dispatched_answer
from mr_review.use_cases.reviews._review_change import apply_review_change
from mr_review.use_cases.reviews.ai_response_parser import (
    ParsedComment,
    ParseResult,
    StreamingCommentParser,
    parse_ai_response,
)
from mr_review.use_cases.reviews.context_files import (
    CONCURRENCY,
    collect_commit_history,
    collect_context_files,
    collect_full_files,
    collect_related_code,
    collect_test_files,
)
from mr_review.use_cases.reviews.iteration_comments import (
    ensure_iteration_editable,
    find_iteration_index,
    replace_iteration,
)
from mr_review.use_cases.reviews.prompt_builder import build_prompt, format_diff
from mr_review.use_cases.reviews.source_resolver import resolve_source

_log = logging.getLogger(__name__)

_DEFAULT_OPTIONS = DispatchOptions()


class DispatchModelMissingError(ValueError):
    """The dispatch names no model and the provider has none configured to fall back on."""


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
    """The whole answer has been parsed and the iteration written."""

    iteration_id: UUID
    # Comments now on the iteration: the new ones, or the previous ones when ``kept_previous``.
    comments: int
    errors: int
    json_error: str | None
    truncated: bool
    # The answer was not used — unreadable, cut off or empty — and the iteration kept what it had.
    kept_previous: bool


DispatchEvent = DispatchChunk | DispatchCommentPreview | DispatchCompleted


@dataclass(frozen=True, slots=True)
class _Started:
    iteration_id: UUID
    baseline: DispatchBaseline


async def _noop_dict() -> dict[str, str]:
    return {}


async def _noop_commit_history() -> dict[str, list[dict[str, str]]]:
    return {}


async def _close_stream(stream: AsyncIterator[object]) -> None:
    """Release the provider's connection and concurrency slot when the stream is abandoned early."""
    if not isinstance(stream, AsyncGenerator):
        return
    try:
        await stream.aclose()
    except Exception:
        _log.warning("Closing an abandoned AI response stream failed", exc_info=True)


def _dispatch_target(review: Review, iteration_id: UUID | None) -> Iteration | None:
    """The iteration a dispatch writes into, or ``None`` when it needs a new one.

    Raises ``ValueError`` for an unknown iteration and ``IterationLockedError`` for a posted one.
    """
    if iteration_id is not None:
        iteration = review.iterations[find_iteration_index(review, iteration_id)]
        ensure_iteration_editable(iteration)
        return iteration
    # Reuse the last iteration while it has not been posted.
    last = review.iterations[-1] if review.iterations else None
    if last is not None and last.completed_at is None and last.stage != IterationStage.post:
        return last
    return None


def _begin_dispatch(
    review: Review,
    *,
    iteration_id: UUID | None,
    ai_provider_id: UUID,
    model: str | None,
    started: list[_Started],
) -> Review:
    """Mark the target iteration as dispatching, creating it if needed, and record what it was.

    Its comments stay until an answer replaces them. ``started`` receives the iteration id and
    the baseline to return to if the answer is not used.
    """
    target = _dispatch_target(review, iteration_id)
    if target is None:
        dispatching = Iteration(
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
        updated = review.model_copy(update={"iterations": [*review.iterations, dispatching]})
    else:
        dispatching = target.model_copy(
            update={"stage": IterationStage.dispatch, "ai_provider_id": ai_provider_id, "model": model}
        )
        updated = replace_iteration(review, find_iteration_index(review, target.id), dispatching)
    started.append(_Started(iteration_id=dispatching.id, baseline=DispatchBaseline.of(target)))
    return updated


def _settle(
    review: Review,
    *,
    started: _Started,
    raw: str,
    result: ParseResult,
    finished: bool,
    settled: list[SettledAnswer],
) -> Review:
    index = find_iteration_index(review, started.iteration_id)
    outcome = settle_dispatched_answer(review.iterations[index], started.baseline, raw, result, finished=finished)
    settled.append(outcome)
    return replace_iteration(review, index, outcome.iteration)


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
        options: DispatchOptions = _DEFAULT_OPTIONS,
        iteration_id: UUID | None = None,
    ) -> AsyncIterator[DispatchEvent]:
        """Build the prompt and return the event stream; the review is first written when it starts.

        Raises ``ValueError`` for an unknown review, host, provider or iteration,
        ``DispatchModelMissingError`` when no model is named and the provider has none, and
        ``IterationLockedError`` for an iteration that was already posted.
        """
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        host = await self._host_repo.get_by_id(review.host_id)
        if host is None:
            raise ValueError(f"Host {review.host_id} not found")

        ai_provider = await self._ai_provider_repo.get_by_id(ai_provider_id)
        if ai_provider is None:
            raise ValueError(f"AI provider {ai_provider_id} not found")
        options = self._with_model(options, ai_provider)

        # Checked now so a bad request fails before the slow context collection; the iteration
        # itself is resolved again against a fresh read when the stream starts.
        target = _dispatch_target(review, iteration_id)
        if target is not None:
            cfg = target.brief_config
        else:
            cfg = review.iterations[-1].brief_config if review.iterations else BriefConfig()

        provider = self._vcs_factory(host)
        resolved = await resolve_source(review, provider)
        diff_files = resolved.diff_files
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

        return self._stream_and_save(
            review_id=review_id,
            iteration_id=target.id if target is not None else None,
            prompt=prompt,
            ai_provider=ai_provider,
            options=options,
        )

    @staticmethod
    def _with_model(options: DispatchOptions, ai_provider: AIProvider) -> DispatchOptions:
        """``options`` naming the model to call: the requested one, else the provider's first."""
        model = options.model or (ai_provider.models[0] if ai_provider.models else None)
        if not model:
            raise DispatchModelMissingError(
                f"AI provider '{ai_provider.name}' has no models configured — choose a model for the dispatch "
                "or add one to the provider in Settings"
            )
        return replace(options, model=model)

    async def _stream_and_save(
        self,
        review_id: UUID,
        iteration_id: UUID | None,
        prompt: str,
        ai_provider: AIProvider,
        options: DispatchOptions = _DEFAULT_OPTIONS,
    ) -> AsyncGenerator[DispatchEvent, None]:
        """Relay the model's answer, preview comments as they complete, then store the result.

        ``iteration_id`` names the iteration to dispatch into; ``None`` reuses the last one that
        was not posted, or creates one. ``DispatchCompleted`` comes last and only after the
        iteration has been written. If the provider fails or the client goes away, whatever
        arrived is settled — shielded from the cancellation that a disconnect delivers — and the
        exception propagates. Nothing is written before the stream is first iterated.
        """
        started: list[_Started] = []
        begin = partial(
            _begin_dispatch,
            iteration_id=iteration_id,
            ai_provider_id=ai_provider.id,
            model=options.model,
            started=started,
        )
        with anyio.CancelScope(shield=True):
            await apply_review_change(self._review_repo, review_id, begin)
        target = started[-1]

        parts: list[str] = []
        preview = StreamingCommentParser()
        emitted = 0
        stream: AsyncIterator[AIStreamItem] | None = None
        # The provider's own word that it stopped at the output limit, on top of what the parser sees.
        provider_truncated = False
        try:
            stream = await self._ai_dispatcher_factory(ai_provider, prompt, options)
            async for chunk in stream:
                if isinstance(chunk, AIStreamEnd):
                    provider_truncated = chunk.truncated
                    continue
                if not chunk:
                    continue
                parts.append(chunk)
                yield DispatchChunk(text=chunk)
                for comment in preview.feed(chunk):
                    yield DispatchCommentPreview(index=emitted, comment=comment)
                    emitted += 1
        except BaseException:
            with anyio.CancelScope(shield=True):
                if stream is not None:
                    await _close_stream(stream)
                await self._settle_interrupted(review_id, target, "".join(parts))
            raise

        with anyio.CancelScope(shield=True):
            completed = await self._settle_answer(
                review_id, target, "".join(parts), finished=True, provider_truncated=provider_truncated
            )
        yield completed

    async def _settle_answer(
        self, review_id: UUID, target: _Started, raw: str, *, finished: bool, provider_truncated: bool = False
    ) -> DispatchCompleted:
        """Parse ``raw`` and write what it may change, against a fresh read of the review.

        ``provider_truncated`` is the provider reporting that it stopped at its output limit: the
        answer counts as cut off even when its text happens to parse, and is settled as such.
        Raises ``ValueError`` when the review or the iteration was deleted meanwhile.
        """
        result = await asyncio.to_thread(parse_ai_response, raw)
        if provider_truncated and not result.truncated:
            result = replace(result, truncated=True)
        settled: list[SettledAnswer] = []
        change = partial(_settle, started=target, raw=raw, result=result, finished=finished, settled=settled)
        await apply_review_change(self._review_repo, review_id, change)
        outcome = settled[-1]
        return DispatchCompleted(
            iteration_id=target.iteration_id,
            comments=len(outcome.iteration.comments),
            errors=len(result.errors),
            json_error=result.json_error,
            truncated=result.truncated,
            kept_previous=not outcome.applied,
        )

    async def _settle_interrupted(self, review_id: UUID, target: _Started, raw: str) -> None:
        try:
            await self._settle_answer(review_id, target, raw, finished=False)
        except Exception:
            _log.exception("Failed to settle the interrupted dispatch of iteration %s", target.iteration_id)
