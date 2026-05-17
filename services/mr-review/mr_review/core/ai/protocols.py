from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import AbstractAsyncContextManager
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from mr_review.core.ai_providers.entities import AIProvider as AIProviderEntity


class AIProvider(Protocol):
    def dispatch(self, prompt: str) -> AsyncIterator[str]: ...


class AIFenceRegistry(Protocol):
    """Per-provider concurrency fence — caps simultaneous in-flight AI dispatches."""

    def acquire(self, ai_provider: AIProviderEntity) -> AbstractAsyncContextManager[None]: ...


# Factory that builds a streaming AI dispatcher: takes provider entity + prompt + dispatch params,
# returns an awaitable that resolves to an async iterator of text chunks.
AIDispatcherFactory = Callable[
    [
        "AIProviderEntity",
        str,
        "str | None",
        "float | None",
        "int | None",
        "str | None",
    ],
    "Awaitable[AsyncIterator[str]]",
]

# Lists available models for a given AI provider entity.
ModelLister = Callable[["AIProviderEntity"], "Awaitable[list[str]]"]
