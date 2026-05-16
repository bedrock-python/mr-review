from __future__ import annotations

from uuid import UUID

from mr_review.core.ai.protocols import ModelLister
from mr_review.core.ai_providers.repositories import AIProviderRepository


class ListProviderModelsUseCase:
    def __init__(self, repo: AIProviderRepository, model_lister: ModelLister) -> None:
        self._repo = repo
        self._model_lister = model_lister

    async def execute(self, provider_id: UUID) -> list[str]:
        provider = await self._repo.get_by_id(provider_id)
        if provider is None:
            raise ValueError(f"AI provider {provider_id} not found")

        return await self._model_lister(provider)
