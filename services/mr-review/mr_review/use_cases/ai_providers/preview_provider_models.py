from datetime import datetime, timezone
from uuid import UUID, uuid4

from pydantic import SecretStr

from mr_review.core.ai.protocols import ModelLister
from mr_review.core.ai_providers.entities import AIProvider, AIProviderType
from mr_review.core.ai_providers.repositories import AIProviderRepository


class ProviderSettingsIncompleteError(ValueError):
    """A new provider's models were requested without the settings needed to reach it."""


class PreviewProviderModelsUseCase:
    """List an endpoint's models with settings that are not saved yet.

    The settings form uses it so "Fetch models" reaches the endpoint the form describes — a new
    provider, or an existing one with an edited key or base URL — rather than the saved one.
    """

    def __init__(self, repo: AIProviderRepository, model_lister: ModelLister) -> None:
        self._repo = repo
        self._model_lister = model_lister

    async def execute(
        self,
        provider_id: UUID | None = None,
        type_: AIProviderType | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
        ssl_verify: bool | None = None,
        timeout: int | None = None,
    ) -> list[str]:
        saved = await self._saved(provider_id)
        resolved_type = type_ or (saved.type if saved else None)
        key = api_key if api_key else (saved.api_key.get_secret_value() if saved else "")
        if resolved_type is None or not key:
            raise ProviderSettingsIncompleteError("Fetching models needs the provider type and an API key")
        preview = AIProvider(
            id=saved.id if saved else uuid4(),
            name=saved.name if saved else "preview",
            type=resolved_type,
            api_key=SecretStr(key),
            base_url=base_url if base_url is not None else (saved.base_url if saved else ""),
            models=[],
            ssl_verify=ssl_verify if ssl_verify is not None else (saved.ssl_verify if saved else True),
            timeout=timeout or (saved.timeout if saved else 60),
            created_at=saved.created_at if saved else datetime.now(timezone.utc),
        )
        return await self._model_lister(preview)

    async def _saved(self, provider_id: UUID | None) -> AIProvider | None:
        if provider_id is None:
            return None
        saved = await self._repo.get_by_id(provider_id)
        if saved is None:
            raise ValueError(f"AI provider {provider_id} not found")
        return saved
