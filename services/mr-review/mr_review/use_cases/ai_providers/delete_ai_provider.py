from uuid import UUID

from mr_review.infra.repositories.ai_provider import FileAIProviderRepository


class DeleteAIProviderUseCase:
    def __init__(self, repo: FileAIProviderRepository) -> None:
        self._repo = repo

    async def execute(self, provider_id: UUID) -> bool:
        return await self._repo.delete(provider_id)
