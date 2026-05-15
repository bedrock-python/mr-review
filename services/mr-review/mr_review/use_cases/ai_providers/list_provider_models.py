from uuid import UUID

from mr_review.infra.ai.claude import ClaudeProvider
from mr_review.infra.ai.openai_compat import OpenAICompatProvider
from mr_review.infra.repositories.ai_provider import FileAIProviderRepository


class ListProviderModelsUseCase:
    def __init__(self, repo: FileAIProviderRepository) -> None:
        self._repo = repo

    async def execute(self, provider_id: UUID) -> list[str]:
        provider = await self._repo.get_by_id(provider_id)
        if provider is None:
            raise ValueError(f"AI provider {provider_id} not found")

        if provider.type == "claude":
            ai: ClaudeProvider | OpenAICompatProvider = ClaudeProvider(
                api_key=provider.api_key,
                ssl_verify=provider.ssl_verify,
                timeout=provider.timeout,
            )
        else:
            ai = OpenAICompatProvider(
                api_key=provider.api_key,
                base_url=provider.base_url or None,
                ssl_verify=provider.ssl_verify,
                timeout=provider.timeout,
            )

        return await ai.list_models()
