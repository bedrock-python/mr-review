"""DI container factory for API."""

from dishka import AsyncContainer, make_async_container

from mr_review.api.config import Settings
from mr_review.infra.di.providers.api_config import ApiConfigProvider
from mr_review.infra.di.providers.repositories import RepositoryProvider
from mr_review.infra.di.providers.use_cases import UseCaseProvider


def create_api_container(settings: Settings) -> AsyncContainer:
    """Create DI container for API."""
    return make_async_container(
        ApiConfigProvider(settings),
        RepositoryProvider(),
        UseCaseProvider(),
    )
