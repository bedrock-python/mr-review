from mr_review.core.ai_providers.entities import AIProvider, AIProviderType
from mr_review.infra.repositories.ai_provider import FileAIProviderRepository


class CreateAIProviderUseCase:
    def __init__(self, repo: FileAIProviderRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        name: str,
        type_: AIProviderType,
        api_key: str,
        base_url: str,
        models: list[str],
        ssl_verify: bool = True,
        timeout: int = 60,
    ) -> AIProvider:
        return await self._repo.create(
            name=name,
            type_=type_,
            api_key=api_key,
            base_url=base_url,
            models=models,
            ssl_verify=ssl_verify,
            timeout=timeout,
        )
