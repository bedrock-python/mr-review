from __future__ import annotations

from typing import AsyncIterator, Protocol


class AIProvider(Protocol):
    async def dispatch(self, prompt: str) -> AsyncIterator[str]: ...
