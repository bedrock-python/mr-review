from __future__ import annotations

from typing import Protocol
from uuid import UUID

from mr_review.core.ai_providers.entities import AIProvider


class AIProviderRepository(Protocol):
    async def create(
        self,
        name: str,
        type_: str,
        api_key: str,
        base_url: str,
        models: list[str],
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
    ) -> AIProvider | None: ...

    async def delete(self, provider_id: UUID) -> bool: ...
