"""Unit tests for the OpenAI / OpenAI-compatible backend: the request it sends and how it reads chunks."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

import httpx2
import pytest
from mr_review.core.ai.capabilities import resolve_capabilities
from mr_review.core.ai.entities import AIStreamEnd, AIStreamItem, DispatchOptions
from mr_review.core.ai.errors import AIProviderError, AIProviderRefusalError
from mr_review.core.ai.generation import plan_generation
from mr_review.core.ai.review_format import REVIEW_COMMENTS_SCHEMA
from mr_review.core.ai_providers.entities import AIProviderType
from mr_review.infra.ai.openai_compat import OpenAICompatProvider

pytestmark = pytest.mark.unit


def _chunk(content: str | None = None, finish_reason: str | None = None) -> dict[str, Any]:
    return {
        "id": "c1",
        "object": "chat.completion.chunk",
        "created": 1,
        "model": "m",
        "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": finish_reason}],
    }


# What Azure sends first: the prompt's content-filter verdict, with no choices at all.
_AZURE_FILTER_CHUNK: dict[str, Any] = {
    "id": "",
    "object": "",
    "created": 0,
    "model": "",
    "choices": [],
    "prompt_filter_results": [{"prompt_index": 0, "content_filter_results": {}}],
}
# What a server reporting usage sends last.
_USAGE_CHUNK: dict[str, Any] = {
    "id": "c1",
    "object": "chat.completion.chunk",
    "created": 1,
    "model": "m",
    "choices": [],
    "usage": {"prompt_tokens": 5, "completion_tokens": 7, "total_tokens": 12},
}


def _stream(*chunks: dict[str, Any]) -> bytes:
    return b"".join(f"data: {json.dumps(c)}\n\n".encode() for c in chunks) + b"data: [DONE]\n\n"


class _Recorder(httpx2.MockTransport):
    def __init__(self, handler: Callable[[httpx2.Request], httpx2.Response]) -> None:
        self.requests: list[httpx2.Request] = []
        self.closed = False

        def record(request: httpx2.Request) -> httpx2.Response:
            self.requests.append(request)
            return handler(request)

        super().__init__(record)

    async def aclose(self) -> None:
        self.closed = True

    def body(self) -> dict[str, Any]:
        result: dict[str, Any] = json.loads(self.requests[-1].content)
        return result


def _streaming(body: bytes) -> Callable[[httpx2.Request], httpx2.Response]:
    return lambda _request: httpx2.Response(200, headers={"content-type": "text/event-stream"}, content=body)


async def _dispatch(
    transport: _Recorder, provider_type: AIProviderType, model: str, **options: Any
) -> list[AIStreamItem]:
    provider = OpenAICompatProvider("sk-test", provider_type=provider_type, transport=transport)
    plan = plan_generation(resolve_capabilities(provider_type, model), DispatchOptions(model=model, **options))
    return [item async for item in provider.dispatch("review this", plan)]


async def test__dispatch__chunks_without_choices__skipped() -> None:
    """Regression: a chunk with an empty ``choices`` list (Azure content filter, usage) raised IndexError."""
    transport = _Recorder(_streaming(_stream(_AZURE_FILTER_CHUNK, _chunk("[]"), _chunk(None, "stop"), _USAGE_CHUNK)))

    items = await _dispatch(transport, "openai_compat", "gpt-4o-azure")

    assert items == ["[]", AIStreamEnd(truncated=False)]
    assert transport.closed


async def test__dispatch__finish_reason_length__reports_truncation() -> None:
    transport = _Recorder(_streaming(_stream(_chunk('[{"body": "x"'), _chunk(None, "length"))))

    items = await _dispatch(transport, "openai", "gpt-4o")

    assert items[-1] == AIStreamEnd(truncated=True)


async def test__dispatch__content_filter_stop__refusal_error() -> None:
    transport = _Recorder(_streaming(_stream(_chunk("[{"), _chunk(None, "content_filter"))))

    with pytest.raises(AIProviderRefusalError, match="content filter"):
        await _dispatch(transport, "openai_compat", "model")


async def test__dispatch__reasoning_budget__not_used_as_the_output_limit() -> None:
    """Regression: max_completion_tokens was set to the reasoning budget, capping the whole answer at it."""
    transport = _Recorder(_streaming(_stream(_chunk("[]", "stop"))))

    await _dispatch(transport, "openai_compat", "deepseek-r1", reasoning_budget=2000)

    body = transport.body()
    assert body["reasoning_budget"] == 2000
    assert "max_completion_tokens" not in body
    assert "max_tokens" not in body


async def test__dispatch__reasoning_effort__top_level_parameter_without_temperature() -> None:
    transport = _Recorder(_streaming(_stream(_chunk("[]", "stop"))))

    await _dispatch(transport, "openai", "o3", reasoning_effort="high", temperature=0.5)

    body = transport.body()
    assert body["reasoning_effort"] == "high"
    assert "temperature" not in body


async def test__dispatch__output_limit__max_completion_tokens_for_openai_max_tokens_for_compat() -> None:
    openai_transport = _Recorder(_streaming(_stream(_chunk("[]", "stop"))))
    compat_transport = _Recorder(_streaming(_stream(_chunk("[]", "stop"))))

    await _dispatch(openai_transport, "openai", "gpt-5", max_output_tokens=20_000)
    await _dispatch(compat_transport, "openai_compat", "llama3", max_output_tokens=20_000)

    assert openai_transport.body()["max_completion_tokens"] == 20_000
    assert "max_tokens" not in openai_transport.body()
    assert compat_transport.body()["max_tokens"] == 20_000
    assert "max_completion_tokens" not in compat_transport.body()


async def test__dispatch__structured_output__strict_json_schema_response_format() -> None:
    transport = _Recorder(_streaming(_stream(_chunk('{"comments": []}', "stop"))))

    await _dispatch(transport, "openai", "gpt-4o")

    response_format = transport.body()["response_format"]
    assert response_format["type"] == "json_schema"
    assert response_format["json_schema"]["strict"] is True
    assert response_format["json_schema"]["schema"] == REVIEW_COMMENTS_SCHEMA


async def test__dispatch__compat__no_structured_output_and_temperature_sent() -> None:
    transport = _Recorder(_streaming(_stream(_chunk("[]", "stop"))))

    await _dispatch(transport, "openai_compat", "llama3", temperature=0.2)

    body = transport.body()
    assert "response_format" not in body
    assert body["temperature"] == 0.2
    assert body["messages"][0]["role"] == "system"


async def test__dispatch__structured_output_rejected__suggests_turning_it_off() -> None:
    error = {"error": {"message": "response_format json_schema is not supported", "type": "invalid_request_error"}}
    transport = _Recorder(lambda _request: httpx2.Response(400, json=error))

    with pytest.raises(AIProviderError, match="not supported.*turn Structured output off"):
        await _dispatch(transport, "openai_compat", "llama3", structured_output=True)


async def test__list_models__sorted_and_client_closed() -> None:
    data = {"object": "list", "data": [{"id": i, "object": "model", "created": 0, "owned_by": "x"} for i in ("b", "a")]}
    transport = _Recorder(lambda _request: httpx2.Response(200, json=data))

    models = await OpenAICompatProvider("sk", transport=transport).list_models()

    assert models == ["a", "b"]
    assert transport.closed


async def test__list_models__unreachable__names_the_cause() -> None:
    def refuse(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.ConnectError("Connection refused", request=request)

    provider = OpenAICompatProvider("sk", transport=_Recorder(refuse))

    with pytest.raises(AIProviderError, match="Could not reach.*Connection refused"):
        await provider.list_models()
