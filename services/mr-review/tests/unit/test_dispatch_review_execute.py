"""Unit tests for DispatchReviewUseCase.execute and _stream_and_save."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from mr_review.core.mrs.entities import MR
from mr_review.core.reviews.entities import IterationStage, Review
from mr_review.use_cases.reviews.dispatch_review import DispatchReviewUseCase

from tests.factories.entities import make_ai_provider, make_host, make_iteration, make_review

pytestmark = pytest.mark.unit

_NOW = datetime.now(timezone.utc)


def _make_mr(**kwargs: object) -> MR:
    return MR(
        iid=int(str(kwargs.get("iid", 1))),
        title=str(kwargs.get("title", "Fix bug")),
        description=str(kwargs.get("description", "Details")),
        author=str(kwargs.get("author", "dev")),
        source_branch=str(kwargs.get("source_branch", "feature/x")),
        target_branch=str(kwargs.get("target_branch", "main")),
        status="opened",
        draft=bool(kwargs.get("draft", False)),
        additions=int(str(kwargs.get("additions", 0))),
        deletions=int(str(kwargs.get("deletions", 0))),
        file_count=int(str(kwargs.get("file_count", 0))),
        created_at=_NOW,
        updated_at=_NOW,
    )


async def _async_iter(items: list[str]) -> AsyncIterator[str]:
    for item in items:
        yield item


def _make_use_case(
    review_repo: AsyncMock,
    host_repo: AsyncMock,
    ai_provider_repo: AsyncMock,
    mock_vcs: AsyncMock | None = None,
    ai_dispatcher_factory: object | None = None,
) -> tuple[DispatchReviewUseCase, AsyncMock]:
    provider = mock_vcs or AsyncMock()
    vcs_factory = MagicMock(return_value=provider)

    async def _default_dispatcher(ai_provider: object, prompt: str, model: object, temperature: object, reasoning_budget: object, reasoning_effort: object) -> AsyncIterator[str]:
        return _async_iter([json.dumps([])])

    factory = ai_dispatcher_factory or _default_dispatcher
    use_case = DispatchReviewUseCase(review_repo, host_repo, ai_provider_repo, vcs_factory, factory)
    return use_case, provider


# ── execute ───────────────────────────────────────────────────────────────────


async def test__execute__review_not_found__raises_value_error() -> None:
    """Raises ValueError when review does not exist."""
    review_repo = AsyncMock()
    host_repo = AsyncMock()
    ai_provider_repo = AsyncMock()
    review_repo.get_by_id.return_value = None

    use_case, _ = _make_use_case(review_repo, host_repo, ai_provider_repo)

    with pytest.raises(ValueError, match="not found"):
        await use_case.execute(uuid4(), uuid4())


async def test__execute__host_not_found__raises_value_error() -> None:
    """Raises ValueError when host does not exist."""
    review_repo = AsyncMock()
    host_repo = AsyncMock()
    ai_provider_repo = AsyncMock()
    review = make_review()
    review_repo.get_by_id.return_value = review
    host_repo.get_by_id.return_value = None

    use_case, _ = _make_use_case(review_repo, host_repo, ai_provider_repo)

    with pytest.raises(ValueError, match="not found"):
        await use_case.execute(review.id, uuid4())


async def test__execute__provider_not_found__raises_value_error() -> None:
    """Raises ValueError when AI provider does not exist."""
    review_repo = AsyncMock()
    host_repo = AsyncMock()
    ai_provider_repo = AsyncMock()
    review = make_review()
    host = make_host(type="gitlab")
    review_repo.get_by_id.return_value = review
    host_repo.get_by_id.return_value = host
    ai_provider_repo.get_by_id.return_value = None

    mock_vcs = AsyncMock()
    mock_vcs.get_mr.return_value = _make_mr()
    mock_vcs.get_diff.return_value = []
    use_case, _ = _make_use_case(review_repo, host_repo, ai_provider_repo, mock_vcs)

    with pytest.raises(ValueError, match="not found"):
        await use_case.execute(review.id, uuid4())


async def test__execute__happy_path__creates_iteration_with_dispatch_stage() -> None:
    """Creates a new iteration in dispatch stage and returns an async iterator."""
    review_repo = AsyncMock()
    host_repo = AsyncMock()
    ai_provider_repo = AsyncMock()
    review = make_review()
    host = make_host(type="gitlab")
    ai_provider = make_ai_provider(type="claude", api_key="sk-test", models=["claude-haiku-4-5"])
    review_repo.get_by_id.return_value = review
    review_repo.update.return_value = review
    host_repo.get_by_id.return_value = host
    ai_provider_repo.get_by_id.return_value = ai_provider

    mock_vcs = AsyncMock()
    mock_vcs.get_mr.return_value = _make_mr(title="My MR", description="Some desc")
    mock_vcs.get_diff.return_value = []

    dispatched_chunks = [json.dumps([])]

    async def _factory(prov: object, prompt: str, model: object, temperature: object, reasoning_budget: object, reasoning_effort: object) -> AsyncIterator[str]:
        return _async_iter(dispatched_chunks)

    use_case, _ = _make_use_case(review_repo, host_repo, ai_provider_repo, mock_vcs, _factory)

    result = await use_case.execute(review.id, ai_provider.id)
    chunks = [c async for c in result]

    assert chunks == dispatched_chunks
    review_repo.update.assert_awaited()
    first_call: Review = review_repo.update.call_args_list[0][0][0]
    assert any(it.stage == IterationStage.dispatch for it in first_call.iterations)


# ── _stream_and_save ──────────────────────────────────────────────────────────


async def test__stream_and_save__streams_chunks_and_persists() -> None:
    """Streams chunks from ai_dispatcher_factory and persists the accumulated response."""
    review_repo = AsyncMock()
    iteration = make_iteration(stage=IterationStage.dispatch, comments=[])
    review = make_review(iterations=[iteration])
    review_repo.get_by_id.return_value = review

    ai_provider = make_ai_provider(type="claude", api_key="sk-test", models=["claude-haiku-4-5"])
    ai_response = json.dumps([{"file": None, "line": None, "severity": "minor", "body": "Looks good"}])

    received: list[tuple[object, str, object, object, object, object]] = []

    async def _factory(prov: object, prompt: str, model: object, temperature: object, reasoning_budget: object, reasoning_effort: object) -> AsyncIterator[str]:
        received.append((prov, prompt, model, temperature, reasoning_budget, reasoning_effort))
        return _async_iter([ai_response[:10], ai_response[10:]])

    use_case, _ = _make_use_case(review_repo, AsyncMock(), AsyncMock(), ai_dispatcher_factory=_factory)

    chunks = [  # noqa: SLF001
        c async for c in use_case._stream_and_save(review.id, iteration.id, "my_prompt", ai_provider)
    ]

    assert "".join(chunks) == ai_response
    assert len(received) == 1
    assert received[0][0] is ai_provider
    assert received[0][1] == "my_prompt"


async def test__stream_and_save__model_override__passes_to_factory() -> None:
    """Passes the explicit model override through to the dispatcher factory."""
    review_repo = AsyncMock()
    iteration = make_iteration(stage=IterationStage.dispatch, comments=[])
    review = make_review(iterations=[iteration])
    review_repo.get_by_id.return_value = review

    ai_provider = make_ai_provider(type="claude", api_key="sk-test", models=["claude-haiku-4-5"])

    received_model: list[object] = []

    async def _factory(prov: object, prompt: str, model: object, temperature: object, reasoning_budget: object, reasoning_effort: object) -> AsyncIterator[str]:
        received_model.append(model)
        return _async_iter([json.dumps([])])

    use_case, _ = _make_use_case(review_repo, AsyncMock(), AsyncMock(), ai_dispatcher_factory=_factory)

    _ = [  # noqa: SLF001
        c
        async for c in use_case._stream_and_save(
            review.id, iteration.id, "prompt", ai_provider, model="claude-opus-4-7"
        )
    ]

    assert received_model == ["claude-opus-4-7"]


async def test__stream_and_save__review_gone_after_stream__no_persist_error() -> None:
    """When the review is gone after streaming, _persist_ai_response is a no-op."""
    review_repo = AsyncMock()
    iteration = make_iteration(stage=IterationStage.dispatch, comments=[])
    review = make_review(iterations=[iteration])
    # _persist_ai_response calls get_by_id once; returning None makes it a no-op.
    review_repo.get_by_id.return_value = None

    ai_provider = make_ai_provider(type="claude", api_key="sk-test", models=[])

    async def _factory(prov: object, prompt: str, model: object, temperature: object, reasoning_budget: object, reasoning_effort: object) -> AsyncIterator[str]:
        return _async_iter([json.dumps([])])

    use_case, _ = _make_use_case(review_repo, AsyncMock(), AsyncMock(), ai_dispatcher_factory=_factory)

    # Should not raise
    _ = [c async for c in use_case._stream_and_save(review.id, iteration.id, "prompt", ai_provider)]

    review_repo.update.assert_not_awaited()
