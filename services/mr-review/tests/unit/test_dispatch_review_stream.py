"""Unit tests for the dispatch stream: event order, persistence, and what survives a failure."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import anyio
import pytest
from mr_review.core.reviews.entities import Iteration, IterationStage, Review
from mr_review.use_cases.reviews.dispatch_review import (
    DispatchChunk,
    DispatchCommentPreview,
    DispatchCompleted,
    DispatchEvent,
    DispatchReviewUseCase,
)

from tests.factories.entities import make_ai_provider, make_comment, make_host, make_iteration, make_review

pytestmark = pytest.mark.unit


class _Model:
    """A scripted AI stream: yields ``chunks``, then raises ``error`` or waits forever if asked to."""

    def __init__(self, chunks: list[str], *, error: Exception | None = None, hang: bool = False) -> None:
        self.chunks = chunks
        self.error = error
        self.hang = hang
        self.closed = False

    async def __call__(self, *_args: object) -> AsyncIterator[str]:
        return self._stream()

    async def _stream(self) -> AsyncIterator[str]:
        try:
            for chunk in self.chunks:
                yield chunk
            if self.error is not None:
                raise self.error
            if self.hang:
                await asyncio.Event().wait()
        finally:
            self.closed = True


def _repo_holding(review: Review) -> AsyncMock:
    """A review repository mock whose reads see its own writes."""
    repo = AsyncMock()
    state = {"review": review}

    async def get_by_id(_review_id: object) -> Review:
        return state["review"]

    async def update(updated: Review) -> Review:
        state["review"] = updated
        return updated

    repo.get_by_id.side_effect = get_by_id
    repo.update.side_effect = update
    return repo


def _saved_iteration(repo: AsyncMock) -> Iteration:
    saved: Review = repo.update.call_args[0][0]
    return saved.iterations[-1]


def _use_case(repo: AsyncMock, model: _Model) -> DispatchReviewUseCase:
    return DispatchReviewUseCase(repo, AsyncMock(), AsyncMock(), MagicMock(), model)


def _stream(
    use_case: DispatchReviewUseCase, review: Review, previous: Iteration | None = None
) -> AsyncIterator[DispatchEvent]:
    return use_case._stream_and_save(  # noqa: SLF001
        review.id,
        review.iterations[-1].id,
        "prompt",
        make_ai_provider(),
        restore_on_failure=previous,
    )


async def _drain(stream: AsyncIterator[DispatchEvent], into: list[DispatchEvent] | None = None) -> None:
    async for event in stream:
        if into is not None:
            into.append(event)


def _redispatched() -> tuple[Iteration, Review]:
    """An iteration that had comments in ``polish`` and has just been switched to ``dispatch``."""
    previous = make_iteration(
        stage=IterationStage.polish,
        comments=[make_comment(body="Old comment")],
        ai_provider_id=uuid4(),
        model="old-model",
    )
    dispatching = previous.model_copy(
        update={"stage": IterationStage.dispatch, "ai_provider_id": uuid4(), "model": "new-model"}
    )
    return previous, make_review(iterations=[dispatching])


async def test__stream_and_save__events__chunks_previews_and_done_after_persistence() -> None:
    review = make_review(iterations=[make_iteration(stage=IterationStage.dispatch)])
    repo = _repo_holding(review)
    model = _Model(['[{"file": "a.py", "line": 3, "body": "One"}', ', {"body": "Tw', 'o"}]'])
    events: list[DispatchEvent] = []

    async for event in _stream(_use_case(repo, model), review):
        if isinstance(event, DispatchCompleted):
            # The iteration must already be stored when done is announced.
            assert _saved_iteration(repo).stage == IterationStage.polish
        events.append(event)

    assert [type(e).__name__ for e in events] == [
        "DispatchChunk",
        "DispatchCommentPreview",
        "DispatchChunk",
        "DispatchChunk",
        "DispatchCommentPreview",
        "DispatchCompleted",
    ]
    previews = [e for e in events if isinstance(e, DispatchCommentPreview)]
    assert [(p.index, p.comment.body) for p in previews] == [(0, "One"), (1, "Two")]
    done = events[-1]
    assert isinstance(done, DispatchCompleted)
    assert (done.comments, done.errors, done.json_error, done.truncated) == (2, 0, None, False)
    saved = _saved_iteration(repo)
    assert [c.body for c in saved.comments] == ["One", "Two"]
    assert saved.raw_response == "".join(model.chunks)


async def test__stream_and_save__unparseable_answer__one_general_comment_and_json_error() -> None:
    review = make_review(iterations=[make_iteration(stage=IterationStage.dispatch)])
    repo = _repo_holding(review)

    events = [e async for e in _stream(_use_case(repo, _Model(["LGTM, ", "nothing to add."])), review)]

    done = events[-1]
    assert isinstance(done, DispatchCompleted)
    assert done.comments == 1
    assert done.json_error is not None
    assert [c.body for c in _saved_iteration(repo).comments] == ["LGTM, nothing to add."]


async def test__stream_and_save__empty_answer__no_empty_body_comment() -> None:
    review = make_review(iterations=[make_iteration(stage=IterationStage.dispatch)])
    repo = _repo_holding(review)

    events = [e async for e in _stream(_use_case(repo, _Model([])), review)]

    done = events[-1]
    assert isinstance(done, DispatchCompleted)
    assert (done.comments, done.json_error) == (0, "The response is empty")
    assert _saved_iteration(repo).comments == []


async def test__stream_and_save__truncated_answer__done_reports_truncation() -> None:
    review = make_review(iterations=[make_iteration(stage=IterationStage.dispatch)])
    repo = _repo_holding(review)
    model = _Model(['[{"body": "One"}, {"body": "Two"}, {"body": "Thr'])

    events = [e async for e in _stream(_use_case(repo, model), review)]

    done = events[-1]
    assert isinstance(done, DispatchCompleted)
    assert (done.comments, done.json_error, done.truncated) == (2, None, True)


async def test__stream_and_save__provider_fails_before_output__comments_and_stage_untouched() -> None:
    previous, review = _redispatched()
    repo = _repo_holding(review)
    model = _Model([], error=RuntimeError("401 Unauthorized"))
    events: list[DispatchEvent] = []

    with pytest.raises(RuntimeError, match="401"):
        await _drain(_stream(_use_case(repo, model), review, previous), events)

    assert events == []
    saved = _saved_iteration(repo)
    assert [c.body for c in saved.comments] == ["Old comment"]
    assert (saved.stage, saved.ai_provider_id, saved.model) == (
        IterationStage.polish,
        previous.ai_provider_id,
        "old-model",
    )
    assert saved.raw_response is None


async def test__stream_and_save__fails_mid_answer__complete_comments_salvaged() -> None:
    previous, review = _redispatched()
    repo = _repo_holding(review)
    model = _Model(['[{"body": "Kept"}, {"body": "Cut o'], error=RuntimeError("overloaded"))

    with pytest.raises(RuntimeError):
        _ = [e async for e in _stream(_use_case(repo, model), review, previous)]

    saved = _saved_iteration(repo)
    assert [c.body for c in saved.comments] == ["Kept"]
    assert saved.stage == IterationStage.polish
    assert saved.raw_response == "".join(model.chunks)


async def test__stream_and_save__fails_mid_answer_without_a_complete_comment__old_comments_and_raw_kept() -> None:
    previous, review = _redispatched()
    repo = _repo_holding(review)
    model = _Model(['[{"body": "Cut o'], error=RuntimeError("context length exceeded"))

    with pytest.raises(RuntimeError):
        _ = [e async for e in _stream(_use_case(repo, model), review, previous)]

    saved = _saved_iteration(repo)
    assert [c.body for c in saved.comments] == ["Old comment"]
    assert saved.stage == IterationStage.polish
    assert saved.raw_response == '[{"body": "Cut o'
    assert all(c.body.strip() for c in saved.comments)


async def test__stream_and_save__new_iteration_fails_before_output__stays_in_dispatch_without_comments() -> None:
    review = make_review(iterations=[make_iteration(stage=IterationStage.dispatch)])
    repo = _repo_holding(review)

    with pytest.raises(RuntimeError):
        _ = [e async for e in _stream(_use_case(repo, _Model([], error=RuntimeError("boom"))), review)]

    saved = _saved_iteration(repo)
    assert saved.stage == IterationStage.dispatch
    assert saved.comments == []


async def test__stream_and_save__consumer_closes_early__partial_answer_stored_and_upstream_closed() -> None:
    previous, review = _redispatched()
    repo = _repo_holding(review)
    model = _Model(['[{"body": "Arrived"}', ", "], hang=True)
    stream = _stream(_use_case(repo, model), review, previous)
    assert isinstance(stream, AsyncIterator)

    first = await anext(stream)
    await stream.aclose()  # type: ignore[attr-defined]

    assert isinstance(first, DispatchChunk)
    assert model.closed
    assert [c.body for c in _saved_iteration(repo).comments] == ["Arrived"]


async def test__stream_and_save__cancelled_like_a_client_disconnect__persistence_still_completes() -> None:
    # sse-starlette cancels the response task group when the client goes away; anyio keeps
    # cancelling every await inside it, so only a shielded save gets the answer to disk.
    previous, review = _redispatched()
    repo = _repo_holding(review)
    model = _Model(['[{"body": "Before the disconnect"}'], hang=True)
    first_event = anyio.Event()

    async def consume() -> None:
        async for _ in _stream(_use_case(repo, model), review, previous):
            first_event.set()

    async with anyio.create_task_group() as task_group:
        task_group.start_soon(consume)
        await first_event.wait()
        task_group.cancel_scope.cancel()

    saved = _saved_iteration(repo)
    assert [c.body for c in saved.comments] == ["Before the disconnect"]
    assert saved.raw_response == '[{"body": "Before the disconnect"}'
    assert model.closed


# ── execute ───────────────────────────────────────────────────────────────────


def _dispatchable(review: Review) -> tuple[DispatchReviewUseCase, AsyncMock, AsyncMock]:
    review_repo = _repo_holding(review)
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = make_host()
    ai_provider_repo = AsyncMock()
    ai_provider_repo.get_by_id.return_value = make_ai_provider()
    vcs = AsyncMock()
    vcs.get_mr.return_value = MagicMock(title="T", description="D", source_branch="feature")
    vcs.get_diff.return_value = []
    vcs_factory = MagicMock(return_value=vcs)
    use_case = DispatchReviewUseCase(review_repo, host_repo, ai_provider_repo, vcs_factory, _Model(["[]"]))
    return use_case, review_repo, vcs


async def test__execute__redispatch__existing_comments_kept_until_the_answer_is_stored() -> None:
    iteration = make_iteration(stage=IterationStage.polish, comments=[make_comment(body="Keep me")])
    use_case, review_repo, _ = _dispatchable(make_review(iterations=[iteration]))

    await use_case.execute(uuid4(), uuid4(), iteration_id=iteration.id)

    marked = _saved_iteration(review_repo)
    assert marked.stage == IterationStage.dispatch
    assert [c.body for c in marked.comments] == ["Keep me"]


async def test__execute__vcs_failure__review_left_untouched() -> None:
    iteration = make_iteration(stage=IterationStage.polish, comments=[make_comment()])
    use_case, review_repo, vcs = _dispatchable(make_review(iterations=[iteration]))
    vcs.get_mr.side_effect = RuntimeError("VCS down")

    with pytest.raises(RuntimeError, match="VCS down"):
        await use_case.execute(uuid4(), uuid4())

    review_repo.update.assert_not_awaited()
