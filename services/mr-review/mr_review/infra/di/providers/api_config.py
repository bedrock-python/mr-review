"""API configuration provider."""

from pathlib import Path

from dishka import Provider, Scope, provide

from mr_review.api.config import Settings


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
        data_dir = settings.data_dir
        data_dir.mkdir(parents=True, exist_ok=True)
        (data_dir / "reviews").mkdir(parents=True, exist_ok=True)
        return data_dir
