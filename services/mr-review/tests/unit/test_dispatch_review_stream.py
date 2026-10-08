"""Unit tests for the dispatch stream: event order, persistence, and what survives a failure."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

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
from mr_review.use_cases.reviews.iteration_comments import IterationLockedError

from tests.factories.entities import make_ai_provider, make_comment, make_host, make_iteration, make_review

pytestmark = pytest.mark.unit

_OLD_PROVIDER = UUID("00000000-0000-0000-0000-0000000000aa")
_OLD_ANSWER = '[{"body": "Old"}]'
_PROVIDER = make_ai_provider()


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


def _stored(repo: AsyncMock) -> Iteration:
    saved: Review = repo.update.call_args[0][0]
    return saved.iterations[-1]


def _use_case(repo: AsyncMock, model: object) -> DispatchReviewUseCase:
    return DispatchReviewUseCase(repo, AsyncMock(), AsyncMock(), MagicMock(), model)  # type: ignore[arg-type]


def _stream(use_case: DispatchReviewUseCase, iteration: Iteration) -> AsyncIterator[DispatchEvent]:
    return use_case._stream_and_save(uuid4(), iteration.id, "prompt", _PROVIDER, model="new-model")  # noqa: SLF001


async def _drain(stream: AsyncIterator[DispatchEvent], into: list[DispatchEvent] | None = None) -> None:
    async for event in stream:
        if into is not None:
            into.append(event)


def _empty_iteration() -> Iteration:
    return make_iteration(stage=IterationStage.brief, comments=[])


def _triaged_iteration() -> Iteration:
    """An iteration whose comments came from an earlier answer and may have been triaged since."""
    return make_iteration(
        stage=IterationStage.polish,
        comments=[make_comment(body="Old one"), make_comment(body="Old two")],
        ai_provider_id=_OLD_PROVIDER,
        model="old-model",
    ).model_copy(update={"raw_response": _OLD_ANSWER})


def _assert_left_as_it_was(iteration: Iteration) -> None:
    assert [c.body for c in iteration.comments] == ["Old one", "Old two"]
    assert (iteration.stage, iteration.ai_provider_id, iteration.model) == (
        IterationStage.polish,
        _OLD_PROVIDER,
        "old-model",
    )
    assert iteration.raw_response == _OLD_ANSWER


async def test__stream_and_save__events__chunks_previews_and_done_after_persistence() -> None:
    iteration = _empty_iteration()
    repo = _repo_holding(make_review(iterations=[iteration]))
    model = _Model(['[{"file": "a.py", "line": 3, "body": "One"}', ', {"body": "Tw', 'o"}]'])
    events: list[DispatchEvent] = []

    async for event in _stream(_use_case(repo, model), iteration):
        if isinstance(event, DispatchCompleted):
            # The iteration must already be stored when done is announced.
            assert _stored(repo).stage == IterationStage.polish
        elif not events:
            # Before the first chunk the iteration was marked as dispatching.
            assert _stored(repo).stage == IterationStage.dispatch
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
    assert events[-1] == DispatchCompleted(
        iteration_id=iteration.id, comments=2, errors=0, json_error=None, truncated=False, kept_previous=False
    )
    stored = _stored(repo)
    assert [c.body for c in stored.comments] == ["One", "Two"]
    assert (stored.ai_provider_id, stored.model) == (_PROVIDER.id, "new-model")
    assert stored.raw_response == "".join(model.chunks)


async def test__stream_and_save__complete_answer__replaces_previous_comments() -> None:
    iteration = _triaged_iteration()
    repo = _repo_holding(make_review(iterations=[iteration]))

    events = [e async for e in _stream(_use_case(repo, _Model(['[{"body": "New"}]'])), iteration)]

    assert isinstance(events[-1], DispatchCompleted)
    assert (events[-1].comments, events[-1].kept_previous) == (1, False)
    assert [c.body for c in _stored(repo).comments] == ["New"]


async def test__stream_and_save__no_findings__replaces_previous_comments_with_none() -> None:
    iteration = _triaged_iteration()
    repo = _repo_holding(make_review(iterations=[iteration]))

    events = [e async for e in _stream(_use_case(repo, _Model(["[]"])), iteration)]

    assert isinstance(events[-1], DispatchCompleted)
    assert (events[-1].comments, events[-1].kept_previous, events[-1].json_error) == (0, False, None)
    assert _stored(repo).comments == []
    assert _stored(repo).stage == IterationStage.polish


@pytest.mark.parametrize(
    "chunks",
    [[], ["  \n"], ["LGTM, nothing to add."], ["<think>\nran out of tokens [here]"], ['[{"body": "A"}, {"body": "B']],
    ids=["empty", "blank", "prose", "reasoning_cut_off", "truncated"],
)
async def test__stream_and_save__unusable_answer__previous_comments_stage_and_answer_kept(chunks: list[str]) -> None:
    iteration = _triaged_iteration()
    repo = _repo_holding(make_review(iterations=[iteration]))

    events = [e async for e in _stream(_use_case(repo, _Model(chunks)), iteration)]

    done = events[-1]
    assert isinstance(done, DispatchCompleted)
    assert (done.comments, done.kept_previous) == (2, True)
    assert done.json_error is not None or done.truncated
    _assert_left_as_it_was(_stored(repo))


async def test__stream_and_save__unparseable_answer_on_an_empty_iteration__one_general_comment() -> None:
    iteration = _empty_iteration()
    repo = _repo_holding(make_review(iterations=[iteration]))

    events = [e async for e in _stream(_use_case(repo, _Model(["LGTM, ", "nothing to add."])), iteration)]

    done = events[-1]
    assert isinstance(done, DispatchCompleted)
    assert (done.comments, done.kept_previous) == (1, False)
    assert done.json_error is not None
    assert [c.body for c in _stored(repo).comments] == ["LGTM, nothing to add."]
    assert _stored(repo).raw_response == "LGTM, nothing to add."


async def test__stream_and_save__truncated_answer_on_an_empty_iteration__complete_comments_stored() -> None:
    iteration = _empty_iteration()
    repo = _repo_holding(make_review(iterations=[iteration]))

    events = [e async for e in _stream(_use_case(repo, _Model(['[{"body": "One"}, {"body": "Tw'])), iteration)]

    done = events[-1]
    assert isinstance(done, DispatchCompleted)
    assert (done.comments, done.truncated, done.kept_previous) == (1, True, False)
    assert [c.body for c in _stored(repo).comments] == ["One"]


async def test__stream_and_save__empty_answer_on_an_empty_iteration__nothing_saved_and_back_to_brief() -> None:
    iteration = _empty_iteration()
    repo = _repo_holding(make_review(iterations=[iteration]))

    events = [e async for e in _stream(_use_case(repo, _Model([])), iteration)]

    done = events[-1]
    assert isinstance(done, DispatchCompleted)
    assert (done.comments, done.kept_previous, done.json_error) == (0, True, "The response is empty")
    stored = _stored(repo)
    assert (stored.stage, stored.comments, stored.raw_response) == (IterationStage.brief, [], None)


async def test__stream_and_save__provider_fails_before_output__iteration_left_as_it_was() -> None:
    iteration = _triaged_iteration()
    repo = _repo_holding(make_review(iterations=[iteration]))
    events: list[DispatchEvent] = []

    with pytest.raises(RuntimeError, match="401"):
        await _drain(_stream(_use_case(repo, _Model([], error=RuntimeError("401 Unauthorized"))), iteration), events)

    assert events == []
    _assert_left_as_it_was(_stored(repo))


async def test__stream_and_save__provider_cannot_be_started__iteration_left_as_it_was() -> None:
    iteration = _triaged_iteration()
    repo = _repo_holding(make_review(iterations=[iteration]))

    async def failing_factory(*_args: object) -> AsyncIterator[str]:
        raise RuntimeError("bad provider config")

    with pytest.raises(RuntimeError, match="bad provider config"):
        await _drain(_stream(_use_case(repo, failing_factory), iteration))

    _assert_left_as_it_was(_stored(repo))


async def test__stream_and_save__fails_mid_answer__previous_comments_kept() -> None:
    iteration = _triaged_iteration()
    repo = _repo_holding(make_review(iterations=[iteration]))
    model = _Model(['[{"body": "New partial"}, {"body": "Cut o'], error=RuntimeError("overloaded"))

    with pytest.raises(RuntimeError):
        await _drain(_stream(_use_case(repo, model), iteration))

    _assert_left_as_it_was(_stored(repo))


async def test__stream_and_save__fails_mid_answer_on_an_empty_iteration__complete_comments_salvaged() -> None:
    iteration = _empty_iteration()
    repo = _repo_holding(make_review(iterations=[iteration]))
    model = _Model(['[{"body": "Kept"}, {"body": "Cut o'], error=RuntimeError("overloaded"))

    with pytest.raises(RuntimeError):
        await _drain(_stream(_use_case(repo, model), iteration))

    stored = _stored(repo)
    assert [c.body for c in stored.comments] == ["Kept"]
    assert stored.stage == IterationStage.polish
    assert stored.raw_response == "".join(model.chunks)


async def test__stream_and_save__fails_before_a_complete_comment_on_an_empty_iteration__back_to_brief() -> None:
    iteration = _empty_iteration()
    repo = _repo_holding(make_review(iterations=[iteration]))
    model = _Model(['[{"body": "Cut o'], error=RuntimeError("context length exceeded"))

    with pytest.raises(RuntimeError):
        await _drain(_stream(_use_case(repo, model), iteration))

    stored = _stored(repo)
    assert (stored.stage, stored.comments, stored.raw_response) == (IterationStage.brief, [], None)


async def test__stream_and_save__consumer_closes_early__settled_and_upstream_closed() -> None:
    iteration = _empty_iteration()
    repo = _repo_holding(make_review(iterations=[iteration]))
    model = _Model(['[{"body": "Arrived"}', ", "], hang=True)
    stream = _stream(_use_case(repo, model), iteration)

    first = await anext(stream)
    await stream.aclose()  # type: ignore[attr-defined]

    assert isinstance(first, DispatchChunk)
    assert model.closed
    assert [c.body for c in _stored(repo).comments] == ["Arrived"]


async def test__stream_and_save__cancelled_like_a_client_disconnect__settlement_still_written() -> None:
    # sse-starlette cancels the response task group when the client goes away; anyio keeps
    # cancelling every await inside it, so only a shielded write reaches the store.
    iteration = _triaged_iteration()
    repo = _repo_holding(make_review(iterations=[iteration]))
    model = _Model(['[{"body": "Before the disconnect"}'], hang=True)
    first_event = anyio.Event()

    async def consume() -> None:
        async for _ in _stream(_use_case(repo, model), iteration):
            first_event.set()

    async with anyio.create_task_group() as task_group:
        task_group.start_soon(consume)
        await first_event.wait()
        task_group.cancel_scope.cancel()

    _assert_left_as_it_was(_stored(repo))
    assert model.closed


async def test__stream_and_save__new_iteration_after_a_posted_one__created_when_the_stream_starts() -> None:
    posted = make_iteration(stage=IterationStage.post, comments=[make_comment()])
    repo = _repo_holding(make_review(iterations=[posted]))
    use_case = _use_case(repo, _Model(['[{"body": "Fresh"}]']))

    events = [e async for e in use_case._stream_and_save(uuid4(), None, "prompt", make_ai_provider())]  # noqa: SLF001

    saved: Review = repo.update.call_args[0][0]
    assert [it.stage for it in saved.iterations] == [IterationStage.post, IterationStage.polish]
    assert saved.iterations[1].number == 2
    assert isinstance(events[-1], DispatchCompleted)
    assert events[-1].iteration_id == saved.iterations[1].id


async def test__stream_and_save__iteration_left_in_dispatch_by_a_crash__returns_to_polish_when_unused() -> None:
    stuck = _triaged_iteration().model_copy(update={"stage": IterationStage.dispatch})
    repo = _repo_holding(make_review(iterations=[stuck]))

    await _drain(_stream(_use_case(repo, _Model(["not json"])), stuck))

    assert _stored(repo).stage == IterationStage.polish


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


async def test__execute__nothing_written_until_the_stream_starts() -> None:
    iteration = make_iteration(stage=IterationStage.polish, comments=[make_comment(body="Keep me")])
    use_case, review_repo, _ = _dispatchable(make_review(iterations=[iteration]))

    stream = await use_case.execute(uuid4(), uuid4(), iteration_id=iteration.id)

    review_repo.update.assert_not_awaited()
    first = await anext(stream)
    assert isinstance(first, DispatchChunk)
    marked = _stored(review_repo)
    assert marked.stage == IterationStage.dispatch
    assert [c.body for c in marked.comments] == ["Keep me"]


async def test__execute__posted_iteration__locked_before_any_work() -> None:
    iteration = make_iteration(stage=IterationStage.post)
    use_case, review_repo, vcs = _dispatchable(make_review(iterations=[iteration]))

    with pytest.raises(IterationLockedError):
        await use_case.execute(uuid4(), uuid4(), iteration_id=iteration.id)

    vcs.get_mr.assert_not_awaited()
    review_repo.update.assert_not_awaited()


async def test__execute__vcs_failure__review_left_untouched() -> None:
    iteration = make_iteration(stage=IterationStage.polish, comments=[make_comment()])
    use_case, review_repo, vcs = _dispatchable(make_review(iterations=[iteration]))
    vcs.get_mr.side_effect = RuntimeError("VCS down")

    with pytest.raises(RuntimeError, match="VCS down"):
        await use_case.execute(uuid4(), uuid4())

    review_repo.update.assert_not_awaited()
