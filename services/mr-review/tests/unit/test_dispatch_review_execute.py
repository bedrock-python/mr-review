"""Unit tests for DispatchReviewUseCase.execute and _stream_and_save."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx
import pytest
from mr_review.core.mrs.entities import MR
from mr_review.core.reviews.entities import IterationStage, Review
from mr_review.infra.vcs.cache import VCSCache
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


# ── execute ───────────────────────────────────────────────────────────────────


def _make_use_case(
    review_repo: AsyncMock,
    host_repo: AsyncMock,
    ai_provider_repo: AsyncMock,
    mock_vcs: AsyncMock | None = None,
) -> tuple[DispatchReviewUseCase, AsyncMock]:
    vcs_cache = MagicMock(spec=VCSCache)
    provider = mock_vcs or AsyncMock()
    vcs_cache.get_or_create.return_value = provider
    vcs_client = MagicMock(spec=httpx.AsyncClient)
    use_case = DispatchReviewUseCase(review_repo, host_repo, ai_provider_repo, vcs_cache, vcs_client)
    return use_case, provider


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
    use_case, _ = _make_use_case(review_repo, host_repo, ai_provider_repo, mock_vcs)

    with patch("mr_review.use_cases.reviews.dispatch_review.ClaudeProvider") as mock_claude_cls:
        mock_ai = AsyncMock()
        mock_ai.dispatch.return_value = _async_iter([json.dumps([])])
        mock_claude_cls.return_value = mock_ai

        result = await use_case.execute(review.id, ai_provider.id)
        chunks = [c async for c in result]

    assert chunks == [json.dumps([])]
    review_repo.update.assert_awaited()
    first_call: Review = review_repo.update.call_args_list[0][0][0]
    assert any(it.stage == IterationStage.dispatch for it in first_call.iterations)


# ── _stream_and_save ──────────────────────────────────────────────────────────


async def test__stream_and_save__claude_provider__streams_chunks_and_persists() -> None:
    """Uses ClaudeProvider when type='claude', streams chunks, and persists."""
    review_repo = AsyncMock()
    iteration = make_iteration(stage=IterationStage.dispatch, comments=[])
    review = make_review(iterations=[iteration])
    review_repo.get_by_id.return_value = review

    ai_provider = make_ai_provider(type="claude", api_key="sk-test", models=["claude-haiku-4-5"])
    ai_response = json.dumps([{"file": None, "line": None, "severity": "minor", "body": "Looks good"}])

    use_case, _ = _make_use_case(review_repo, AsyncMock(), AsyncMock())

    with patch("mr_review.use_cases.reviews.dispatch_review.ClaudeProvider") as mock_claude_cls:
        mock_ai = AsyncMock()
        mock_ai.dispatch.return_value = _async_iter([ai_response[:10], ai_response[10:]])
        mock_claude_cls.return_value = mock_ai

        chunks = [  # noqa: SLF001
            c async for c in use_case._stream_and_save(review.id, iteration.id, "prompt", ai_provider)
        ]

    assert "".join(chunks) == ai_response
    mock_claude_cls.assert_called_once_with(
        api_key="sk-test",
        model="claude-haiku-4-5",
        ssl_verify=True,
        timeout=60,
        temperature=None,
        reasoning_budget=None,
    )


async def test__stream_and_save__openai_compat_provider__uses_correct_class() -> None:
    """Uses OpenAICompatProvider when type is not 'claude'."""
    review_repo = AsyncMock()
    iteration = make_iteration(stage=IterationStage.dispatch, comments=[])
    review = make_review(iterations=[iteration])
    review_repo.get_by_id.return_value = review

    ai_provider = make_ai_provider(
        type="openai",
        api_key="sk-openai",
        models=["gpt-4o"],
        base_url="https://api.openai.com",
    )
    ai_response = json.dumps([])

    use_case, _ = _make_use_case(review_repo, AsyncMock(), AsyncMock())

    with patch("mr_review.use_cases.reviews.dispatch_review.OpenAICompatProvider") as mock_oai_cls:
        mock_ai = AsyncMock()
        mock_ai.dispatch.return_value = _async_iter([ai_response])
        mock_oai_cls.return_value = mock_ai

        chunks = [  # noqa: SLF001
            c async for c in use_case._stream_and_save(review.id, iteration.id, "prompt", ai_provider)
        ]

    assert "".join(chunks) == ai_response
    mock_oai_cls.assert_called_once_with(
        api_key="sk-openai",
        model="gpt-4o",
        base_url="https://api.openai.com",
        ssl_verify=True,
        timeout=60,
        temperature=None,
        reasoning_budget=None,
        reasoning_effort=None,
    )


async def test__stream_and_save__model_override__uses_provided_model() -> None:
    """Uses the explicitly supplied model instead of provider's default."""
    review_repo = AsyncMock()
    iteration = make_iteration(stage=IterationStage.dispatch, comments=[])
    review = make_review(iterations=[iteration])
    review_repo.get_by_id.return_value = review

    ai_provider = make_ai_provider(type="claude", api_key="sk-test", models=["claude-haiku-4-5"])

    use_case, _ = _make_use_case(review_repo, AsyncMock(), AsyncMock())

    with patch("mr_review.use_cases.reviews.dispatch_review.ClaudeProvider") as mock_claude_cls:
        mock_ai = AsyncMock()
        mock_ai.dispatch.return_value = _async_iter([json.dumps([])])
        mock_claude_cls.return_value = mock_ai

        _ = [  # noqa: SLF001
            c
            async for c in use_case._stream_and_save(
                review.id, iteration.id, "prompt", ai_provider, model="claude-opus-4-7"
            )
        ]

    mock_claude_cls.assert_called_once_with(
        api_key="sk-test",
        model="claude-opus-4-7",
        ssl_verify=True,
        timeout=60,
        temperature=None,
        reasoning_budget=None,
    )


async def test__stream_and_save__no_models_list__falls_back_to_default() -> None:
    """Defaults to claude-opus-4-5 when provider has empty models list."""
    review_repo = AsyncMock()
    iteration = make_iteration(stage=IterationStage.dispatch, comments=[])
    review = make_review(iterations=[iteration])
    review_repo.get_by_id.return_value = review

    ai_provider = make_ai_provider(type="claude", api_key="sk-test", models=[])

    use_case, _ = _make_use_case(review_repo, AsyncMock(), AsyncMock())

    with patch("mr_review.use_cases.reviews.dispatch_review.ClaudeProvider") as mock_claude_cls:
        mock_ai = AsyncMock()
        mock_ai.dispatch.return_value = _async_iter([json.dumps([])])
        mock_claude_cls.return_value = mock_ai

        _ = [  # noqa: SLF001
            c async for c in use_case._stream_and_save(review.id, iteration.id, "prompt", ai_provider)
        ]

    mock_claude_cls.assert_called_once_with(
        api_key="sk-test",
        model="claude-opus-4-5",
        ssl_verify=True,
        timeout=60,
        temperature=None,
        reasoning_budget=None,
    )
