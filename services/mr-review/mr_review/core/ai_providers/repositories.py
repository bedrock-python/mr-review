from __future__ import annotations

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
    ) -> AIProvider | None: ...

    async def delete(self, provider_id: UUID) -> bool: ...
