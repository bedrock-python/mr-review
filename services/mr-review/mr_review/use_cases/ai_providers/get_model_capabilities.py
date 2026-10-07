from uuid import UUID

from mr_review.core.ai.capabilities import resolve_capabilities
from mr_review.core.ai.entities import ModelCapabilities
from mr_review.core.ai_providers.repositories import AIProviderRepository


class ModelNotSpecifiedError(ValueError):
    """No model was named and the provider has none configured."""


class GetModelCapabilitiesUseCase:
    """What a provider's model accepts — decided from its id, no call to the provider."""

    def __init__(self, repo: AIProviderRepository) -> None:
        self._repo = repo

    async def execute(self, provider_id: UUID, model: str | None = None) -> ModelCapabilities:
        provider = await self._repo.get_by_id(provider_id)
        if provider is None:
            raise ValueError(f"AI provider {provider_id} not found")
        resolved = (model or "").strip() or (provider.models[0] if provider.models else "")
        if not resolved:
            raise ModelNotSpecifiedError(f"AI provider '{provider.name}' has no models configured — name a model")
        return resolve_capabilities(provider.type, resolved)
