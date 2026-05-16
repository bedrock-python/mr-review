from __future__ import annotations

import ssl
from collections.abc import AsyncIterator
from typing import Any

import anthropic
import httpx


def _make_httpx_client(ssl_verify: bool, timeout: int) -> httpx.AsyncClient:
    if ssl_verify:
        verify: bool | ssl.SSLContext = ssl.create_default_context()
    else:
        verify = False
    return httpx.AsyncClient(verify=verify, timeout=float(timeout))


_SYSTEM_PROMPT = (
    "You are an expert code reviewer. Your task is to analyse a merge request diff and "
    "produce actionable, precise review comments. You output ONLY a valid JSON array — "
    "no prose, no markdown fences, no explanation before or after the array."
)


class ClaudeProvider:
    def __init__(
        self,
        api_key: str,
        model: str = "claude-opus-4-5",
        ssl_verify: bool = True,
        timeout: int = 60,
        temperature: float | None = None,
        reasoning_budget: int | None = None,
    ) -> None:
        self._client = anthropic.AsyncAnthropic(
            api_key=api_key,
            http_client=_make_httpx_client(ssl_verify=ssl_verify, timeout=timeout),
        )
        self._model = model
        self._temperature = temperature
        self._reasoning_budget = reasoning_budget

    async def list_models(self) -> list[str]:
        page = await self._client.models.list()
        return sorted(m.id for m in page.data)

    async def dispatch(self, prompt: str) -> AsyncIterator[str]:
        return self._stream(prompt)

    async def _stream(self, prompt: str) -> AsyncIterator[str]:
        kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": 16000,
            "system": _SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": prompt}],
        }

        if self._reasoning_budget is not None:
            # Extended thinking — temperature must be 1 per Anthropic spec
            kwargs["thinking"] = {
                "type": "enabled",
                "budget_tokens": max(1024, self._reasoning_budget),
            }
            kwargs["temperature"] = 1
        elif self._temperature is not None:
            kwargs["temperature"] = self._temperature

        async with self._client.messages.stream(**kwargs) as stream:
            async for text in stream.text_stream:
                yield text
