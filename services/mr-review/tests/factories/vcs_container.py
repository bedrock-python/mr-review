"""The real DI container with the shared VCS client pointed at a mock transport."""

from __future__ import annotations

from collections.abc import AsyncIterable
from pathlib import Path

import httpx
from dishka import AsyncContainer, make_async_container, provide
from mr_review.api.config import Settings
from mr_review.infra.di.providers.api_config import ApiConfigProvider
from mr_review.infra.di.providers.repositories import RepositoryProvider
from mr_review.infra.di.providers.use_cases import UseCaseProvider
from mr_review.infra.di.providers.vcs import VCSInfraProvider


class MockVCSInfraProvider(VCSInfraProvider):
    """Same wiring as production, except the shared client talks to ``transport``."""

    def __init__(self, transport: httpx.AsyncBaseTransport) -> None:
        super().__init__()
        self._transport = transport

    @provide
    async def get_vcs_client(self, settings: Settings) -> AsyncIterable[httpx.AsyncClient]:
        async with httpx.AsyncClient(transport=self._transport, timeout=settings.vcs_timeout) as client:
            yield client


def make_container(data_dir: Path, transport: httpx.AsyncBaseTransport) -> AsyncContainer:
    (data_dir / "reviews").mkdir(parents=True, exist_ok=True)
    return make_async_container(
        ApiConfigProvider(Settings(data_dir=data_dir)),
        RepositoryProvider(),
        MockVCSInfraProvider(transport),
        UseCaseProvider(),
    )
