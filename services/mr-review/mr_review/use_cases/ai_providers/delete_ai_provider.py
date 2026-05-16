from uuid import UUID

from mr_review.core.ai_providers.repositories import AIProviderRepository


class DeleteAIProviderUseCase:
    def __init__(self, repo: AIProviderRepository) -> None:
        self._repo = repo

    async def execute(self, provider_id: UUID) -> bool:
        return await self._repo.delete(provider_id)
