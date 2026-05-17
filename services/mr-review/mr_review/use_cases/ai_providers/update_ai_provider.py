from uuid import UUID

from mr_review.core.ai_providers.entities import AIProvider
from mr_review.core.ai_providers.repositories import AIProviderRepository


class UpdateAIProviderUseCase:
    def __init__(self, repo: AIProviderRepository) -> None:
        self._repo = repo

    async def execute(
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
    ) -> AIProvider | None:
        return await self._repo.update(
            provider_id,
            name=name,
            api_key=api_key,
            base_url=base_url,
            models=models,
            ssl_verify=ssl_verify,
            timeout=timeout,
            max_concurrent=max_concurrent,
            clear_max_concurrent=clear_max_concurrent,
        )
