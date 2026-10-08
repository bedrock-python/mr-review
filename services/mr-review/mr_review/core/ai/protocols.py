from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import AbstractAsyncContextManager
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from mr_review.core.ai.entities import AIStreamItem, DispatchOptions, GenerationPlan
    from mr_review.core.ai_providers.entities import AIProvider as AIProviderEntity


class AIProvider(Protocol):
    def dispatch(self, prompt: str, plan: GenerationPlan) -> AsyncIterator[AIStreamItem]:
        """Stream the answer as text chunks, ending with one ``AIStreamEnd``.

        Raises ``AIProviderError`` subclasses with a message fit to show the user.
        """
        ...

    async def list_models(self) -> list[str]: ...


class AIFenceRegistry(Protocol):
    """Per-provider concurrency fence — caps simultaneous in-flight AI dispatches."""

    def acquire(self, ai_provider: AIProviderEntity) -> AbstractAsyncContextManager[None]: ...


# Builds a streaming AI dispatcher: takes the provider entity, the prompt and the dispatch options,
# returns an awaitable that resolves to the provider's stream — text chunks, then an ``AIStreamEnd``.
AIDispatcherFactory = Callable[
    ["AIProviderEntity", str, "DispatchOptions"],
    "Awaitable[AsyncIterator[AIStreamItem]]",
]

# Lists available models for a given AI provider entity.
ModelLister = Callable[["AIProviderEntity"], "Awaitable[list[str]]"]
