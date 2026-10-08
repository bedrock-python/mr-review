"""Unit tests for the Claude backend: the exact request it sends and how it reads the answer.

The Anthropic API is replaced by an ``httpx2.MockTransport`` that records each request and answers
with a scripted Messages API event stream.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Callable
from typing import Any

import httpx2
import pytest
from mr_review.core.ai.capabilities import resolve_capabilities
from mr_review.core.ai.entities import AIStreamEnd, AIStreamItem, DispatchOptions
from mr_review.core.ai.errors import AIProviderAuthError, AIProviderError, AIProviderRefusalError
from mr_review.core.ai.generation import plan_generation
from mr_review.core.ai.review_format import REVIEW_COMMENTS_SCHEMA
from mr_review.infra.ai.claude import ClaudeProvider

pytestmark = pytest.mark.unit


def _sse(*events: dict[str, Any]) -> bytes:
    return b"".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n".encode() for e in events)


def _message_stream(
    texts: list[str], *, stop_reason: str = "end_turn", stop_details: dict[str, Any] | None = None
) -> bytes:
    message = {
        "id": "msg_1",
        "type": "message",
        "role": "assistant",
        "model": "claude-test",
        "content": [],
        "stop_reason": None,
        "stop_sequence": None,
        "usage": {"input_tokens": 10, "output_tokens": 1},
    }
    events: list[dict[str, Any]] = [
        {"type": "message_start", "message": message},
        {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
        *({"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": t}} for t in texts),
        {"type": "content_block_stop", "index": 0},
        {
            "type": "message_delta",
            "delta": {"stop_reason": stop_reason, "stop_sequence": None, "stop_details": stop_details},
            "usage": {"output_tokens": 20},
        },
        {"type": "message_stop"},
    ]
    return _sse(*events)


class _Recorder(httpx2.MockTransport):
    """A mock transport that keeps every request and notices when its client is closed."""

    def __init__(self, handler: Callable[[httpx2.Request], httpx2.Response]) -> None:
        self.requests: list[httpx2.Request] = []
        self.closed = False

        def record(request: httpx2.Request) -> httpx2.Response:
            self.requests.append(request)
            return handler(request)

        super().__init__(record)

    async def aclose(self) -> None:
        self.closed = True

    def body(self, index: int = -1) -> dict[str, Any]:
        result: dict[str, Any] = json.loads(self.requests[index].content)
        return result


def _streaming(body: bytes) -> Callable[[httpx2.Request], httpx2.Response]:
    return lambda _request: httpx2.Response(200, headers={"content-type": "text/event-stream"}, content=body)


async def _drain(stream: AsyncIterator[AIStreamItem], into: list[AIStreamItem]) -> None:
    async for item in stream:
        into.append(item)


async def _dispatch(
    transport: _Recorder, model: str, *, base_url: str | None = None, **options: Any
) -> list[AIStreamItem]:
    provider = ClaudeProvider("sk-test", base_url=base_url, transport=transport)
    plan = plan_generation(resolve_capabilities("claude", model), DispatchOptions(model=model, **options))
    return [item async for item in provider.dispatch("review this", plan)]


async def test__dispatch__current_model__adaptive_thinking_and_effort_never_budget_or_temperature() -> None:
    """Regression: a thinking budget and a temperature used to be sent as-is, which Opus 5.5 answers with 400."""
    transport = _Recorder(_streaming(_message_stream(["[]"])))

    await _dispatch(transport, "claude-opus-5-5", reasoning_budget=16_000, temperature=0.4)

    body = transport.body()
    assert body["thinking"] == {"type": "adaptive"}
    assert body["output_config"]["effort"] == "high"
    assert "temperature" not in body
    assert "budget_tokens" not in json.dumps(body)


async def test__dispatch__no_reasoning_asked__no_thinking_parameter() -> None:
    transport = _Recorder(_streaming(_message_stream(["[]"])))

    await _dispatch(transport, "claude-opus-4-8", temperature=0.4, structured_output=False)

    body = transport.body()
    assert "thinking" not in body
    assert "output_config" not in body
    assert "temperature" not in body  # Opus 4.7+ rejects sampling parameters


async def test__dispatch__legacy_model__budget_below_max_tokens_and_no_temperature() -> None:
    """Regression: a 16k budget used to go out with max_tokens fixed at 16000 — rejected with 400."""
    transport = _Recorder(_streaming(_message_stream(["[]"])))

    await _dispatch(transport, "claude-haiku-4-5", reasoning_budget=16_000, temperature=0.4)

    body = transport.body()
    assert body["thinking"] == {"type": "enabled", "budget_tokens": 16_000}
    assert body["max_tokens"] > 16_000
    assert "temperature" not in body


async def test__dispatch__legacy_model_without_thinking__temperature_sent() -> None:
    transport = _Recorder(_streaming(_message_stream(["[]"])))

    await _dispatch(transport, "claude-haiku-4-5", temperature=0.4)

    assert transport.body()["temperature"] == 0.4


async def test__dispatch__structured_output__json_schema_format() -> None:
    transport = _Recorder(_streaming(_message_stream(['{"comments": []}'])))

    await _dispatch(transport, "claude-opus-5-5")

    body = transport.body()
    assert body["output_config"]["format"] == {"type": "json_schema", "schema": REVIEW_COMMENTS_SCHEMA}
    assert '"comments"' in body["system"]


async def test__dispatch__max_output_tokens_and_system_prompt_override() -> None:
    transport = _Recorder(_streaming(_message_stream(["[]"])))

    await _dispatch(transport, "claude-opus-5-5", max_output_tokens=50_000, system_prompt="Only security issues.")

    body = transport.body()
    assert body["max_tokens"] == 50_000
    assert body["system"] == "Only security issues."


async def test__dispatch__base_url__request_goes_to_the_gateway() -> None:
    """Regression: base_url used to be ignored for Claude, so a LiteLLM or corporate gateway was unreachable."""
    transport = _Recorder(_streaming(_message_stream(["[]"])))

    await _dispatch(transport, "claude-opus-5-5", base_url="https://llm-gateway.example.com/anthropic")

    assert str(transport.requests[0].url) == "https://llm-gateway.example.com/anthropic/v1/messages"


@pytest.mark.parametrize(
    ("base_url", "expected"),
    [
        ("https://api.anthropic.com/v1", "https://api.anthropic.com/v1/messages"),
        ("https://api.anthropic.com/", "https://api.anthropic.com/v1/messages"),
        ("http://litellm:4000/v1/", "http://litellm:4000/v1/messages"),
        ("  ", "https://api.anthropic.com/v1/messages"),
    ],
)
async def test__dispatch__base_url_with_v1__path_not_doubled(base_url: str, expected: str) -> None:
    """Regression: a saved ``…/v1`` base URL (copied, or left over from an OpenAI type) became ``/v1/v1/messages``."""
    transport = _Recorder(_streaming(_message_stream(["[]"])))

    await _dispatch(transport, "claude-opus-5-5", base_url=base_url)

    assert str(transport.requests[0].url) == expected


async def test__dispatch__streams_text_then_reports_a_complete_answer_and_closes_the_client() -> None:
    transport = _Recorder(_streaming(_message_stream(['[{"body": ', '"x"}]'])))

    items = await _dispatch(transport, "claude-opus-5-5")

    assert items == ['[{"body": ', '"x"}]', AIStreamEnd(truncated=False)]
    assert transport.closed


@pytest.mark.parametrize("stop_reason", ["max_tokens", "model_context_window_exceeded"])
async def test__dispatch__stopped_at_the_limit__reports_truncation(stop_reason: str) -> None:
    transport = _Recorder(_streaming(_message_stream(['{"comments": []}'], stop_reason=stop_reason)))

    items = await _dispatch(transport, "claude-opus-5-5")

    assert items[-1] == AIStreamEnd(truncated=True)


async def test__dispatch__refusal__clear_error_after_the_text() -> None:
    body = _message_stream(
        ["[{"], stop_reason="refusal", stop_details={"type": "refusal", "category": "cyber", "explanation": None}
    )
    transport = _Recorder(_streaming(body))
    provider = ClaudeProvider("sk-test", transport=transport)
    plan = plan_generation(resolve_capabilities("claude", "claude-opus-5-5"), DispatchOptions(model="claude-opus-5-5"))
    received: list[AIStreamItem] = []

    with pytest.raises(AIProviderRefusalError, match=r"declined.*category: cyber"):
        await _drain(provider.dispatch("p", plan), received)

    assert received == ["[{"]
    assert transport.closed


def _error(status: int, message: str) -> Callable[[httpx2.Request], httpx2.Response]:
    payload = {"type": "error", "error": {"type": "invalid_request_error", "message": message}}
    return lambda _request: httpx2.Response(status, json=payload)


async def test__dispatch__rejected_with_structured_output_on__suggests_turning_it_off() -> None:
    transport = _Recorder(_error(400, "output_config.format: not supported"))

    with pytest.raises(AIProviderError, match="output_config.format: not supported.*turn Structured output off"):
        await _dispatch(transport, "claude-opus-5-5")


async def test__dispatch__bad_key__auth_error_with_the_provider_message() -> None:
    transport = _Recorder(_error(401, "invalid x-api-key"))

    with pytest.raises(AIProviderAuthError, match="invalid x-api-key"):
        await _dispatch(transport, "claude-opus-5-5")
    assert transport.closed


async def test__list_models__pages_through_every_page() -> None:
    """Regression: only the first page of models used to be read."""

    def handler(request: httpx2.Request) -> httpx2.Response:
        first_page = request.url.params.get("after_id") is None
        ids = ["claude-opus-5-5", "claude-sonnet-5-5"] if first_page else ["claude-haiku-4-5"]
        has_more = first_page
        data = [{"type": "model", "id": i, "display_name": i, "created_at": "2026-01-01T00:00:00Z"} for i in ids]
        return httpx2.Response(200, json={"data": data, "has_more": has_more, "first_id": ids[0], "last_id": ids[-1]})

    transport = _Recorder(handler)

    models = await ClaudeProvider("sk-test", transport=transport).list_models()

    assert models == ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"]
    assert transport.requests[1].url.params["after_id"] == "claude-sonnet-5-5"
    assert transport.closed


async def test__list_models__bad_key__auth_error() -> None:
    transport = _Recorder(_error(401, "invalid x-api-key"))

    with pytest.raises(AIProviderAuthError):
        await ClaudeProvider("sk-bad", transport=transport).list_models()
