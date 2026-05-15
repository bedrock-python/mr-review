from mr_review.core.ai_providers.entities import AIProvider
from mr_review.infra.repositories.ai_provider import FileAIProviderRepository


class ListAIProvidersUseCase:
    def __init__(self, repo: FileAIProviderRepository) -> None:
        self._repo = repo

    async def execute(self) -> list[AIProvider]:
        return await self._repo.list_all()
