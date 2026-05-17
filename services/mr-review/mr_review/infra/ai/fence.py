"""Per-AIProvider concurrency fence backed by ``asyncio.Semaphore``.

Phase 1 throttling for AI dispatch calls (see issue #11). Caps the number of
in-flight streams per ``AIProvider.id`` so a local model (e.g. Ollama) cannot
be overwhelmed and so cloud usage has a coarse upper bound.

Semaphores are created lazily on first acquire for each provider id and
retained for the process lifetime — once created the capacity is fixed
until restart, even if the persisted ``AIProvider.max_concurrent`` changes.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from uuid import UUID

from mr_review.core.ai_providers.entities import AIProvider


class AsyncioSemaphoreFenceRegistry:
    """``asyncio.Semaphore`` per ``AIProvider.id`` — Phase 1 concurrency fence.

    Resolution: per-provider ``AIProvider.max_concurrent`` if set, otherwise the
    process-wide ``default_max_concurrent`` injected at construction time.
    """

    def __init__(self, default_max_concurrent: int) -> None:
        if default_max_concurrent < 1:
            raise ValueError("default_max_concurrent must be >= 1")
        self._default = default_max_concurrent
        self._semaphores: dict[UUID, asyncio.Semaphore] = {}
        self._lock = asyncio.Lock()

    def acquire(self, ai_provider: AIProvider) -> AbstractAsyncContextManager[None]:
        """Reserve one slot for ``ai_provider``; releases on context exit."""
        return self._acquire(ai_provider)

    @asynccontextmanager
    async def _acquire(self, ai_provider: AIProvider) -> AsyncIterator[None]:
        semaphore = await self._get_or_create(ai_provider)
        async with semaphore:
            yield

    async def _get_or_create(self, ai_provider: AIProvider) -> asyncio.Semaphore:
        existing = self._semaphores.get(ai_provider.id)
        if existing is not None:
            return existing
        async with self._lock:
            existing = self._semaphores.get(ai_provider.id)
            if existing is not None:
                return existing
            cap = ai_provider.max_concurrent if ai_provider.max_concurrent is not None else self._default
            semaphore = asyncio.Semaphore(cap)
            self._semaphores[ai_provider.id] = semaphore
            return semaphore
