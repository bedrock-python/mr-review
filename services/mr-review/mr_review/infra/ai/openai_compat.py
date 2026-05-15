from __future__ import annotations

import ssl
from collections.abc import AsyncIterator

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


class OpenAICompatProvider:
    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o",
        base_url: str | None = None,
        ssl_verify: bool = True,
        timeout: int = 60,
    ) -> None:
        self._client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            http_client=_make_httpx_client(ssl_verify=ssl_verify, timeout=timeout),
        )
        self._model = model

    async def list_models(self) -> list[str]:
        page = await self._client.models.list()
        return sorted(m.id for m in page.data)

    async def dispatch(self, prompt: str) -> AsyncIterator[str]:
        return self._stream(prompt)

    async def _stream(self, prompt: str) -> AsyncIterator[str]:
        stream = await self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content
