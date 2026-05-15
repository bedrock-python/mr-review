from __future__ import annotations

from collections.abc import AsyncIterator

import anthropic


class ClaudeProvider:
    def __init__(self, api_key: str, model: str = "claude-opus-4-5") -> None:
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self._model = model

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
