from __future__ import annotations

import ssl
from collections.abc import AsyncIterator
from typing import Any

import httpx
import openai


def _make_httpx_client(ssl_verify: bool, timeout: int) -> httpx.AsyncClient:
    if ssl_verify:
        # Use the OS/system certificate store instead of certifi's bundle so that
        # corporate/self-signed CAs installed in the system trust store are respected.
        verify: bool | ssl.SSLContext = ssl.create_default_context()
    else:
        verify = False
    return httpx.AsyncClient(verify=verify, timeout=float(timeout))


_SYSTEM_PROMPT = (
    "You are an expert code reviewer. Your task is to analyse a merge request diff and "
    "produce actionable, precise review comments. You output ONLY a valid JSON array — "
    "no prose, no markdown fences, no explanation before or after the array."
)


class OpenAICompatProvider:
    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o",
        base_url: str | None = None,
        ssl_verify: bool = True,
        timeout: int = 60,
        temperature: float | None = None,
        reasoning_budget: int | None = None,
        reasoning_effort: str | None = None,
    ) -> None:
        self._client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            http_client=_make_httpx_client(ssl_verify=ssl_verify, timeout=timeout),
        )
        self._model = model
        self._temperature = temperature
        self._reasoning_budget = reasoning_budget
        self._reasoning_effort = reasoning_effort

    async def list_models(self) -> list[str]:
        page = await self._client.models.list()
        return sorted(m.id for m in page.data)

    async def dispatch(self, prompt: str) -> AsyncIterator[str]:
        return self._stream(prompt)

    async def _stream(self, prompt: str) -> AsyncIterator[str]:
        kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "stream": True,
        }

        if self._reasoning_effort is not None:
            # OpenAI o1/o3/o4-mini style: reasoning_effort = "low" | "medium" | "high"
            kwargs["extra_body"] = {"reasoning_effort": self._reasoning_effort}
        elif self._reasoning_budget is not None:
            # Budget-based reasoning (DeepSeek-R1, Claude-compat, etc.)
            kwargs["max_completion_tokens"] = self._reasoning_budget
            kwargs["extra_body"] = {"reasoning_budget": self._reasoning_budget}
        elif self._temperature is not None:
            kwargs["temperature"] = self._temperature

        stream = await self._client.chat.completions.create(**kwargs)
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content
