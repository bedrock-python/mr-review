"""Repository providers."""

from pathlib import Path

from dishka import Provider, Scope, provide

from mr_review.infra.repositories.ai_provider import FileAIProviderRepository
from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.repositories.review import FileReviewRepository


class RepositoryProvider(Provider):
    """Provider for repositories."""

    scope = Scope.REQUEST

    @provide
    def get_host_repository(self, data_dir: Path) -> FileHostRepository:
        return FileHostRepository(data_dir)

    @provide
    def get_review_repository(self, data_dir: Path) -> FileReviewRepository:
        return FileReviewRepository(data_dir)

    @provide
    def get_ai_provider_repository(self, data_dir: Path) -> FileAIProviderRepository:
        return FileAIProviderRepository(data_dir)
