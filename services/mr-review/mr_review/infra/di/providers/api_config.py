"""API configuration provider."""

from pathlib import Path

from dishka import Provider, Scope, provide

from mr_review.api.config import Settings
from mr_review.core.ai.protocols import AIFenceRegistry
from mr_review.infra.ai.fence import AsyncioSemaphoreFenceRegistry
from mr_review.infra.repositories.file_store import ensure_private_dir


class ApiConfigProvider(Provider):
    """Provider for API configuration objects."""

    scope = Scope.APP

    def __init__(self, settings: Settings) -> None:
        super().__init__()
        self._settings = settings

    @provide
    def get_settings(self) -> Settings:
        return self._settings

    @provide
    def get_data_dir(self, settings: Settings) -> Path:
        # The store holds tokens and API keys: new directories are owner-only.
        data_dir = settings.data_dir
        ensure_private_dir(data_dir)
        ensure_private_dir(data_dir / "reviews")
        return data_dir

    @provide
    def get_ai_fence_registry(self, settings: Settings) -> AIFenceRegistry:
        return AsyncioSemaphoreFenceRegistry(
            default_max_concurrent=settings.ai_throttle.default_max_concurrent,
        )
