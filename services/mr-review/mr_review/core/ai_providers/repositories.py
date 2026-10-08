from __future__ import annotations

from collections.abc import Callable
from typing import Protocol
from uuid import UUID

from mr_review.core.ai_providers.entities import AIProvider, AIProviderType


class AIProviderRepository(Protocol):
    async def create(
        self,
        name: str,
        type_: AIProviderType,
        api_key: str,
        base_url: str,
        models: list[str],
        ssl_verify: bool = True,
        timeout: int = 60,
        max_concurrent: int | None = None,
    ) -> AIProvider: ...

    async def get_by_id(self, provider_id: UUID) -> AIProvider | None: ...

    async def list_all(self) -> list[AIProvider]: ...

    async def update(
        self,
        provider_id: UUID,
        name: str | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
        models: list[str] | None = None,
        ssl_verify: bool | None = None,
        timeout: int | None = None,
        max_concurrent: int | None = None,
        clear_max_concurrent: bool = False,
    ) -> AIProvider | None: ...

    async def update_with(self, provider_id: UUID, change: Callable[[AIProvider], AIProvider]) -> AIProvider | None:
        """Atomically read the provider, apply ``change`` and store the result.

        Concurrent changes are serialised, so none of them is lost. Returning the very
        object ``change`` was given writes nothing. ``None`` when no provider has that id.
        """
        ...

    async def upsert_with(
        self, provider_id: UUID, change: Callable[[AIProvider | None], AIProvider | None]
    ) -> AIProvider | None:
        """Like :meth:`update_with`, but ``change`` gets ``None`` for a missing provider and may create it.

        Returning ``None`` or the object it was given writes nothing. The stored provider is
        returned as-is, ``id`` and ``created_at`` included.
        """
        ...

    async def delete(self, provider_id: UUID) -> bool: ...
