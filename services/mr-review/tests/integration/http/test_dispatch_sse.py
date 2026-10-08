"""HTTP tests of the dispatch SSE protocol and the raw-response endpoints.

The model and the VCS host are faked through DI; reviews go through the real YAML repository.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator, AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest
import pytest_asyncio
from dishka import Provider, Scope, make_async_container, provide
from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from mr_review.api.config import Settings
from mr_review.api.routers.v1.reviews import router as reviews_router
from mr_review.core.ai.entities import AIStreamEnd, AIStreamItem, DispatchOptions
from mr_review.core.ai.errors import AIProviderRefusalError
from mr_review.core.mrs.entities import DiffFile
from mr_review.core.reviews.entities import BriefConfig, Comment, Iteration, IterationStage, Review
from mr_review.core.reviews.sources import BranchDiffSource
from mr_review.infra.di.providers.api_config import ApiConfigProvider
from mr_review.infra.di.providers.repositories import RepositoryProvider
from mr_review.infra.di.providers.use_cases import UseCaseProvider
from mr_review.infra.di.providers.vcs import VCSInfraProvider
from mr_review.infra.repositories.review import FileReviewRepository
from mr_review.use_cases.reviews.dispatch_review import DispatchReviewUseCase

from tests.factories.entities import make_ai_provider, make_comment, make_host, make_iteration
from tests.fakes import save_review

pytestmark = [pytest.mark.integration, pytest.mark.http]


class _Model:
    """A scripted AI stream: yields ``chunks`` and ``end``, then raises ``error`` or waits forever if asked to."""

    def __init__(
        self,
        chunks: list[str],
        *,
        error: Exception | None = None,
        hang: bool = False,
        end: AIStreamEnd | None = None,
    ) -> None:
        self.chunks = chunks
        self.error = error
        self.hang = hang
        self.end = end
        self.options: list[DispatchOptions] = []

    async def __call__(self, _provider: object, _prompt: str, options: DispatchOptions) -> AsyncIterator[AIStreamItem]:
        self.options.append(options)
        return self._stream()

    async def _stream(self) -> AsyncIterator[AIStreamItem]:
        for chunk in self.chunks:
            yield chunk
        if self.end is not None:
            yield self.end
        if self.error is not None:
            raise self.error
        if self.hang:
            await asyncio.Event().wait()


class _BranchDiffVCS:
    def __init__(self, on_fetch: Callable[[], Awaitable[None]] | None) -> None:
        self._on_fetch = on_fetch

    async def get_branch_diff(self, repo_path: str, base_ref: str, head_ref: str) -> list[DiffFile]:
        # Fetching the diff is where a dispatch spends its time before the model is called.
        if self._on_fetch is not None:
            await self._on_fetch()
        return []


class _Found:
    def __init__(self, entity: object) -> None:
        self._entity = entity

    async def get_by_id(self, _entity_id: UUID) -> object:
        return self._entity


class _FakeDispatchProvider(Provider):
    scope = Scope.REQUEST

    def __init__(self) -> None:
        super().__init__()
        self.model: Callable[..., Awaitable[AsyncIterator[AIStreamItem]]] = _Model([])
        self.on_fetch_diff: Callable[[], Awaitable[None]] | None = None
        self.provider = make_ai_provider()

    @provide(override=True)
    def get_dispatch_review_use_case(self, review_repo: FileReviewRepository) -> DispatchReviewUseCase:
        return DispatchReviewUseCase(
            review_repo=review_repo,
            host_repo=_Found(make_host()),  # type: ignore[arg-type]
            ai_provider_repo=_Found(self.provider),  # type: ignore[arg-type]
            vcs_factory=lambda _host: _BranchDiffVCS(self.on_fetch_diff),  # type: ignore[arg-type,return-value]
            ai_dispatcher_factory=self.model,
        )


@dataclass
class _Harness:
    app: FastAPI
    client: AsyncClient
    dispatch: _FakeDispatchProvider
    reviews: FileReviewRepository


@pytest_asyncio.fixture
async def harness(tmp_path: Path) -> AsyncGenerator[_Harness, None]:
    dispatch = _FakeDispatchProvider()
    app = FastAPI()
    app.include_router(reviews_router)
    container = make_async_container(
        ApiConfigProvider(Settings(data_dir=tmp_path)),
        RepositoryProvider(),
        VCSInfraProvider(),
        UseCaseProvider(),
        dispatch,
    )
    setup_dishka(container, app)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield _Harness(app=app, client=client, dispatch=dispatch, reviews=FileReviewRepository(tmp_path))
    await container.close()


async def _seed(
    reviews: FileReviewRepository,
    *,
    comments: list[Comment] | None = None,
    stage: IterationStage = IterationStage.brief,
    raw_response: str | None = None,
) -> tuple[Review, Iteration]:
    review = await reviews.create_from_source(
        host_id=uuid4(), repo_path="ns/repo", source=BranchDiffSource(base_ref="main", head_ref="feature")
    )
    iteration = make_iteration(
        stage=stage, comments=comments or [], brief_config=BriefConfig(include_context=False)
    ).model_copy(update={"raw_response": raw_response})
    review = await save_review(reviews, review.model_copy(update={"iterations": [iteration]}))
    return review, iteration


def _sse_events(body: str) -> list[tuple[str, Any]]:
    """(event, decoded data) pairs; keep-alive comments are skipped, every payload must be one line."""
    events: list[tuple[str, Any]] = []
    for block in body.replace("\r\n", "\n").split("\n\n"):
        lines = [line for line in block.split("\n") if line and not line.startswith(":")]
        if not lines:
            continue
        fields = [line.partition(": ") for line in lines]
        data_lines = [value for name, _, value in fields if name == "data"]
        assert len(data_lines) == 1, block
        event = next((value for name, _, value in fields if name == "event"), "message")
        events.append((event, json.loads(data_lines[0])))
    return events


async def _dispatch(harness: _Harness, review_id: UUID) -> list[tuple[str, Any]]:
    response = await harness.client.post(f"/api/v1/reviews/{review_id}/dispatch", json={"ai_provider_id": str(uuid4())})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    return _sse_events(response.text)


async def test__dispatch__well_formed_answer__chunk_comment_and_done_events_in_order(harness: _Harness) -> None:
    review, iteration = await _seed(harness.reviews)
    chunks = [
        '[{"file": "a.py", "line": 3, "severity": "High", "body": "Строка\\nвторая"}',
        ', {"file": "b.py", "bo',
        'dy": "Second"}]',
    ]
    harness.dispatch.model = _Model(chunks)

    events = await _dispatch(harness, review.id)

    assert [name for name, _ in events] == ["chunk", "comment", "chunk", "chunk", "comment", "done"]
    assert [data for name, data in events if name == "chunk"] == chunks
    assert [data for name, data in events if name == "comment"] == [
        {"index": 0, "file": "a.py", "line": 3, "severity": "major", "body": "Строка\nвторая"},
        {"index": 1, "file": "b.py", "line": None, "severity": "suggestion", "body": "Second"},
    ]
    assert events[-1][1] == {
        "iteration_id": str(iteration.id),
        "comments": 2,
        "errors": 0,
        "json_error": None,
        "truncated": False,
        "kept_previous": False,
        "filtered": 0,
    }


async def test__dispatch__done__iteration_stored_and_raw_answer_served_separately(harness: _Harness) -> None:
    review, iteration = await _seed(harness.reviews)
    chunks = ["Sure!\n```json\n", '[{"file": "a.py", "body": "One"}]', "\n```"]
    harness.dispatch.model = _Model(chunks)

    await _dispatch(harness, review.id)
    fetched = await harness.client.get(f"/api/v1/reviews/{review.id}")
    raw = await harness.client.get(f"/api/v1/reviews/{review.id}/iterations/{iteration.id}/raw-response")

    stored = fetched.json()["iterations"][0]
    assert stored["stage"] == "polish"
    assert [c["body"] for c in stored["comments"]] == ["One"]
    assert "raw_response" not in stored
    assert raw.status_code == 200
    assert raw.headers["content-type"].startswith("text/plain")
    assert raw.text == "".join(chunks)


async def test__dispatch__unparseable_answer__done_reports_json_error_and_keeps_the_text(harness: _Harness) -> None:
    review, _ = await _seed(harness.reviews)
    harness.dispatch.model = _Model(["Looks good to me."])

    events = await _dispatch(harness, review.id)

    done = events[-1]
    assert done[0] == "done"
    assert done[1]["comments"] == 1
    assert done[1]["json_error"]
    stored = await harness.reviews.get_by_id(review.id)
    assert stored is not None
    assert [c.body for c in stored.iterations[0].comments] == ["Looks good to me."]


async def test__dispatch__truncated_answer__done_flags_truncation(harness: _Harness) -> None:
    review, _ = await _seed(harness.reviews)
    harness.dispatch.model = _Model(['[{"body": "One"}, {"body": "Tw'])

    events = await _dispatch(harness, review.id)

    assert events[-1][0] == "done"
    assert (events[-1][1]["comments"], events[-1][1]["truncated"]) == (1, True)


async def test__dispatch__provider_stopped_at_its_limit__done_flags_truncation_even_if_the_json_closed(
    harness: _Harness,
) -> None:
    review, _ = await _seed(harness.reviews)
    harness.dispatch.model = _Model(['[{"body": "One"}]'], end=AIStreamEnd(truncated=True))

    events = await _dispatch(harness, review.id)

    assert [name for name, _ in events] == ["chunk", "comment", "done"]
    assert (events[-1][1]["comments"], events[-1][1]["truncated"]) == (1, True)


async def test__dispatch__provider_stopped_at_its_limit__previous_comments_kept(harness: _Harness) -> None:
    """A parseable answer the provider reports as cut off is still not used over existing comments."""
    review, _ = await _seed(harness.reviews, comments=[make_comment(body="Old")], stage=IterationStage.polish)
    harness.dispatch.model = _Model(['[{"body": "New"}]'], end=AIStreamEnd(truncated=True))

    events = await _dispatch(harness, review.id)

    done = events[-1][1]
    assert (done["truncated"], done["kept_previous"], done["comments"]) == (True, True, 1)
    stored = await harness.reviews.get_by_id(review.id)
    assert stored is not None
    assert [c.body for c in stored.iterations[0].comments] == ["Old"]
    assert stored.iterations[0].stage == IterationStage.polish


async def test__dispatch__refusal__error_event_and_previous_comments_kept(harness: _Harness) -> None:
    review, _ = await _seed(harness.reviews, comments=[make_comment(body="Old")], stage=IterationStage.polish)
    refusal = AIProviderRefusalError("OpenAI declined to complete the review: I'm sorry, I can't help with that.")
    harness.dispatch.model = _Model([], error=refusal)

    events = await _dispatch(harness, review.id)

    assert events == [("error", {"message": str(refusal)})]
    stored = await harness.reviews.get_by_id(review.id)
    assert stored is not None
    assert [c.body for c in stored.iterations[0].comments] == ["Old"]
    assert stored.iterations[0].stage == IterationStage.polish


async def test__dispatch__settings__reach_the_dispatcher_as_one_options_object(harness: _Harness) -> None:
    review, _ = await _seed(harness.reviews)
    harness.dispatch.model = _Model(["[]"], end=AIStreamEnd(truncated=False))
    body = {
        "ai_provider_id": str(uuid4()),
        "model": "claude-opus-5-5",
        "temperature": 0.3,
        "reasoning_effort": "xhigh",
        "reasoning_budget": 4000,
        "max_output_tokens": 40_000,
        "structured_output": False,
        "system_prompt": "Only security issues.",
    }

    response = await harness.client.post(f"/api/v1/reviews/{review.id}/dispatch", json=body)

    assert response.status_code == 200
    assert harness.dispatch.model.options == [
        DispatchOptions(
            model="claude-opus-5-5",
            temperature=0.3,
            reasoning_effort="xhigh",
            reasoning_budget=4000,
            max_output_tokens=40_000,
            structured_output=False,
            system_prompt="Only security issues.",
        )
    ]


async def test__dispatch__no_model_named__provider_first_model_used_and_recorded(harness: _Harness) -> None:
    review, _ = await _seed(harness.reviews)
    harness.dispatch.provider = make_ai_provider(models=["claude-opus-5-5", "claude-haiku-4-5"])
    harness.dispatch.model = _Model(["[]"])

    await _dispatch(harness, review.id)

    assert harness.dispatch.model.options[0].model == "claude-opus-5-5"
    stored = await harness.reviews.get_by_id(review.id)
    assert stored is not None
    assert stored.iterations[0].model == "claude-opus-5-5"


async def test__dispatch__no_model_anywhere__422_instead_of_a_silent_default(harness: _Harness) -> None:
    review, _ = await _seed(harness.reviews)
    harness.dispatch.provider = make_ai_provider(models=[])

    response = await harness.client.post(f"/api/v1/reviews/{review.id}/dispatch", json={"ai_provider_id": str(uuid4())})

    assert response.status_code == 422
    assert "no models configured" in response.json()["detail"]
    assert harness.dispatch.model.options == []


@pytest.mark.parametrize(
    "field",
    [
        {"temperature": 2.5},
        {"temperature": -0.1},
        {"max_output_tokens": 10},
        {"max_output_tokens": 1_000_000},
        {"reasoning_effort": "extreme"},
    ],
)
async def test__dispatch__out_of_range_settings__422(harness: _Harness, field: dict[str, object]) -> None:
    review, _ = await _seed(harness.reviews)

    response = await harness.client.post(
        f"/api/v1/reviews/{review.id}/dispatch", json={"ai_provider_id": str(uuid4()), **field}
    )

    assert response.status_code == 422


async def test__dispatch__provider_fails__error_event_without_done_and_comments_kept(harness: _Harness) -> None:
    review, _ = await _seed(harness.reviews, comments=[make_comment(body="Old")], stage=IterationStage.polish)
    harness.dispatch.model = _Model([], error=RuntimeError("Error code: 401 - invalid x-api-key"))

    events = await _dispatch(harness, review.id)

    assert events == [("error", {"message": "Error code: 401 - invalid x-api-key"})]
    stored = await harness.reviews.get_by_id(review.id)
    assert stored is not None
    assert stored.iterations[0].stage == IterationStage.polish
    assert [c.body for c in stored.iterations[0].comments] == ["Old"]


async def _dispatch_until_disconnect(harness: _Harness, review_id: UUID) -> list[bytes]:
    """Run a dispatch over raw ASGI and disconnect the client once the first comment was sent."""
    comment_sent = asyncio.Event()
    sent: list[bytes] = []
    request_body = json.dumps({"ai_provider_id": str(uuid4())}).encode()
    requested = False

    async def receive() -> dict[str, Any]:
        nonlocal requested
        if not requested:
            requested = True
            return {"type": "http.request", "body": request_body, "more_body": False}
        await comment_sent.wait()
        return {"type": "http.disconnect"}

    async def send(message: dict[str, Any]) -> None:
        body = message.get("body", b"")
        sent.append(body)
        if b"event: comment" in body:
            comment_sent.set()

    path = f"/api/v1/reviews/{review_id}/dispatch"
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [(b"host", b"test"), (b"content-type", b"application/json")],
        "client": ("127.0.0.1", 50000),
        "server": ("test", 80),
    }
    await asyncio.wait_for(harness.app(scope, receive, send), timeout=10)
    return sent


_OLD_ANSWER = '[{"file": "a.py", "body": "Old"}]'


async def test__dispatch__client_disconnects_mid_stream__partial_answer_stored_on_an_empty_iteration(
    harness: _Harness,
) -> None:
    review, _ = await _seed(harness.reviews)
    harness.dispatch.model = _Model(['[{"body": "Arrived before the disconnect"}', ", "], hang=True)

    sent = await _dispatch_until_disconnect(harness, review.id)

    assert not any(b"event: done" in body for body in sent)
    stored = await harness.reviews.get_by_id(review.id)
    assert stored is not None
    assert stored.iterations[0].stage == IterationStage.polish
    assert [c.body for c in stored.iterations[0].comments] == ["Arrived before the disconnect"]
    assert stored.iterations[0].raw_response == '[{"body": "Arrived before the disconnect"}, '


async def test__dispatch__client_disconnects_mid_stream__previous_comments_and_their_answer_kept(
    harness: _Harness,
) -> None:
    review, _ = await _seed(
        harness.reviews, comments=[make_comment(body="Old")], stage=IterationStage.polish, raw_response=_OLD_ANSWER
    )
    harness.dispatch.model = _Model(['[{"body": "Arrived before the disconnect"}', ", "], hang=True)

    await _dispatch_until_disconnect(harness, review.id)

    stored = await harness.reviews.get_by_id(review.id)
    assert stored is not None
    assert stored.iterations[0].stage == IterationStage.polish
    assert [c.body for c in stored.iterations[0].comments] == ["Old"]
    assert stored.iterations[0].raw_response == _OLD_ANSWER


@pytest.mark.parametrize(
    "chunks",
    [[], ["\n\n   "], ["<think>\nStill weighing [a] against {b} when the tokens ran out"], ["Sorry, I can't help."]],
    ids=["empty", "whitespace", "reasoning_cut_off", "prose"],
)
async def test__dispatch__unusable_answer__previous_comments_and_their_answer_kept(
    harness: _Harness, chunks: list[str]
) -> None:
    previous = [make_comment(body="Old one"), make_comment(body="Old two")]
    review, iteration = await _seed(
        harness.reviews, comments=previous, stage=IterationStage.polish, raw_response=_OLD_ANSWER
    )
    harness.dispatch.model = _Model(chunks)

    events = await _dispatch(harness, review.id)

    name, done = events[-1]
    assert name == "done"
    assert done["iteration_id"] == str(iteration.id)
    assert (done["comments"], done["kept_previous"]) == (2, True)
    assert done["json_error"]
    stored = await harness.reviews.get_by_id(review.id)
    assert stored is not None
    assert stored.iterations[0].stage == IterationStage.polish
    assert [c.body for c in stored.iterations[0].comments] == ["Old one", "Old two"]
    assert stored.iterations[0].raw_response == _OLD_ANSWER


async def test__dispatch__empty_answer_on_an_empty_iteration__nothing_saved_and_back_to_brief(
    harness: _Harness,
) -> None:
    review, _ = await _seed(harness.reviews)
    harness.dispatch.model = _Model(["  \n"])

    events = await _dispatch(harness, review.id)

    done = events[-1][1]
    assert (done["comments"], done["kept_previous"], done["json_error"]) == (0, True, "The response is empty")
    stored = await harness.reviews.get_by_id(review.id)
    assert stored is not None
    assert stored.iterations[0].stage == IterationStage.brief
    assert stored.iterations[0].comments == []
    assert stored.iterations[0].raw_response is None


async def test__dispatch__truncated_answer__previous_comments_kept(harness: _Harness) -> None:
    review, _ = await _seed(
        harness.reviews, comments=[make_comment(body="Old")], stage=IterationStage.polish, raw_response=_OLD_ANSWER
    )
    harness.dispatch.model = _Model(['[{"body": "New one"}, {"body": "Cut o'])

    events = await _dispatch(harness, review.id)

    done = events[-1][1]
    assert (done["comments"], done["truncated"], done["kept_previous"]) == (1, True, True)
    stored = await harness.reviews.get_by_id(review.id)
    assert stored is not None
    assert [c.body for c in stored.iterations[0].comments] == ["Old"]
    assert stored.iterations[0].raw_response == _OLD_ANSWER


async def test__dispatch__fails_after_a_partial_answer__previous_comments_and_their_answer_kept(
    harness: _Harness,
) -> None:
    previous = [make_comment(body=f"Old{i}") for i in range(10)]
    review, _ = await _seed(harness.reviews, comments=previous, stage=IterationStage.polish, raw_response=_OLD_ANSWER)
    harness.dispatch.model = _Model(
        ['[{"body": "New partial"}, {"body": "cut'], error=RuntimeError("upstream 529 overloaded")
    )

    events = await _dispatch(harness, review.id)

    assert events[-1] == ("error", {"message": "upstream 529 overloaded"})
    stored = await harness.reviews.get_by_id(review.id)
    assert stored is not None
    assert stored.iterations[0].stage == IterationStage.polish
    assert [c.body for c in stored.iterations[0].comments] == [f"Old{i}" for i in range(10)]
    assert stored.iterations[0].raw_response == _OLD_ANSWER


async def test__dispatch__provider_cannot_be_started__iteration_left_as_it_was(harness: _Harness) -> None:
    previous_provider = uuid4()
    review, _ = await _seed(harness.reviews, comments=[make_comment(body="Old")], stage=IterationStage.polish)
    seeded = await harness.reviews.get_by_id(review.id)
    assert seeded is not None
    iteration = seeded.iterations[0].model_copy(update={"ai_provider_id": previous_provider, "model": "old-model"})
    await save_review(harness.reviews, seeded.model_copy(update={"iterations": [iteration]}))

    async def failing_factory(*_args: object) -> AsyncIterator[str]:
        raise RuntimeError("bad provider config")

    harness.dispatch.model = failing_factory

    events = await _dispatch(harness, review.id)

    assert events == [("error", {"message": "bad provider config"})]
    stored = await harness.reviews.get_by_id(review.id)
    assert stored is not None
    after = stored.iterations[0]
    assert (after.stage, after.ai_provider_id, after.model) == (IterationStage.polish, previous_provider, "old-model")
    assert [c.body for c in after.comments] == ["Old"]


async def test__dispatch__review_edited_while_context_is_collected__edit_survives(harness: _Harness) -> None:
    review, _ = await _seed(harness.reviews, comments=[make_comment(body="Old")], stage=IterationStage.polish)

    async def edit_meanwhile() -> None:
        current = await harness.reviews.get_by_id(review.id)
        assert current is not None
        edited = current.iterations[0].comments[0].model_copy(update={"body": "Edited while dispatching"})
        iteration = current.iterations[0].model_copy(update={"comments": [edited]})
        await save_review(harness.reviews, current.model_copy(update={"iterations": [iteration]}))

    harness.dispatch.on_fetch_diff = edit_meanwhile
    harness.dispatch.model = _Model([], error=RuntimeError("provider down"))

    await _dispatch(harness, review.id)

    stored = await harness.reviews.get_by_id(review.id)
    assert stored is not None
    assert [c.body for c in stored.iterations[0].comments] == ["Edited while dispatching"]


async def test__dispatch__posted_iteration__409(harness: _Harness) -> None:
    review, iteration = await _seed(harness.reviews, stage=IterationStage.post)

    response = await harness.client.post(
        f"/api/v1/reviews/{review.id}/dispatch",
        json={"ai_provider_id": str(uuid4()), "iteration_id": str(iteration.id)},
    )

    assert response.status_code == 409


async def test__dispatch__huge_answer__stored_raw_answer_capped(harness: _Harness) -> None:
    review, iteration = await _seed(harness.reviews)
    answer = '[{"file": "a.py", "body": "Kept"}]' + "\n" + "x" * 2_000_000
    harness.dispatch.model = _Model([answer])

    await _dispatch(harness, review.id)
    raw = await harness.client.get(f"/api/v1/reviews/{review.id}/iterations/{iteration.id}/raw-response")

    assert len(raw.text) < 600_000
    assert raw.text.startswith('[{"file": "a.py", "body": "Kept"}]')
    assert "characters omitted" in raw.text
    assert raw.text.endswith("x" * 1000)


async def test__reparse__answer_still_unusable__existing_comments_kept(harness: _Harness) -> None:
    review, iteration = await _seed(
        harness.reviews, comments=[make_comment(body="Triaged")], stage=IterationStage.polish, raw_response="Sorry."
    )

    response = await harness.client.post(f"/api/v1/reviews/{review.id}/iterations/{iteration.id}/reparse")

    assert response.status_code == 200
    assert (response.json()["imported"], bool(response.json()["json_error"])) == (0, True)
    stored = await harness.reviews.get_by_id(review.id)
    assert stored is not None
    assert [c.body for c in stored.iterations[0].comments] == ["Triaged"]


async def test__reparse__stored_answer__comments_replaced(harness: _Harness) -> None:
    answer = '[{"file": "a.py", "body": "One"}, {"file": "b.py", "body": "Two"}, {"file": "c.py"}]'
    review, iteration = await _seed(
        harness.reviews, comments=[make_comment(body="Stale")], stage=IterationStage.polish, raw_response=answer
    )

    response = await harness.client.post(f"/api/v1/reviews/{review.id}/iterations/{iteration.id}/reparse")

    assert response.status_code == 200
    body = response.json()
    assert (body["imported"], body["json_error"], body["truncated"]) == (2, None, False)
    assert [e["index"] for e in body["errors"]] == [2]
    stored = await harness.reviews.get_by_id(review.id)
    assert stored is not None
    assert [c.body for c in stored.iterations[0].comments] == ["One", "Two"]


async def test__reparse__posted_iteration__409(harness: _Harness) -> None:
    review, iteration = await _seed(harness.reviews, stage=IterationStage.post, raw_response="[]")

    response = await harness.client.post(f"/api/v1/reviews/{review.id}/iterations/{iteration.id}/reparse")

    assert response.status_code == 409


@pytest.mark.parametrize("endpoint", ["raw-response", "reparse"])
async def test__raw_answer_endpoints__nothing_stored__404(harness: _Harness, endpoint: str) -> None:
    review, iteration = await _seed(harness.reviews)
    url = f"/api/v1/reviews/{review.id}/iterations/{iteration.id}/{endpoint}"

    response = await (harness.client.get(url) if endpoint == "raw-response" else harness.client.post(url))

    assert response.status_code == 404


async def test__import_response__raw_answer_kept_for_later(harness: _Harness) -> None:
    review, iteration = await _seed(harness.reviews)
    answer = "{'comments': [{'file': 'a.py', 'body': 'Imported'}]}"

    imported = await harness.client.post(
        f"/api/v1/reviews/{review.id}/import-response", json={"raw": answer, "iteration_id": str(iteration.id)}
    )
    raw = await harness.client.get(f"/api/v1/reviews/{review.id}/iterations/{iteration.id}/raw-response")

    assert imported.json()["imported"] == 1
    assert raw.text == answer
