from __future__ import annotations

import ssl
from collections.abc import AsyncIterator

import anthropic
import httpx


def _make_httpx_client(ssl_verify: bool, timeout: int) -> httpx.AsyncClient:
    if ssl_verify:
        verify: bool | ssl.SSLContext = ssl.create_default_context()
    else:
        verify = False
    return httpx.AsyncClient(verify=verify, timeout=float(timeout))


class ClaudeProvider:
    def __init__(
        self,
        api_key: str,
        model: str = "claude-opus-4-5",
        ssl_verify: bool = True,
        timeout: int = 60,
    ) -> None:
        self._client = anthropic.AsyncAnthropic(
            api_key=api_key,
            http_client=_make_httpx_client(ssl_verify=ssl_verify, timeout=timeout),
        )
        self._model = model

    async def list_models(self) -> list[str]:
        page = await self._client.models.list()
        return sorted(m.id for m in page.data)

    async def dispatch(self, prompt: str) -> AsyncIterator[str]:
        return self._stream(prompt)

    async def _stream(self, prompt: str) -> AsyncIterator[str]:
        async with self._client.messages.stream(
            model=self._model,
            max_tokens=8192,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            async for text in stream.text_stream:
                yield text
