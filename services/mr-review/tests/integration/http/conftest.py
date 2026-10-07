from __future__ import annotations

from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
import pytest_asyncio
from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from mr_review.api.config import Settings
from mr_review.api.routers.v1.hosts import router as hosts_router
from mr_review.api.routers.v1.repos import router as repos_router
from mr_review.api.routers.v1.reviews import router as reviews_router
from mr_review.api.vcs_errors import register_vcs_error_handlers
from mr_review.infra.di.containers.api import create_api_container


@pytest.fixture(scope="session")
def http_settings(tmp_path_factory: pytest.TempPathFactory) -> Settings:
    """Settings wired to a temporary data directory for the whole HTTP test session."""
    data_dir: Path = tmp_path_factory.mktemp("http_data")
    (data_dir / "reviews").mkdir()
    return Settings(data_dir=data_dir)


@pytest_asyncio.fixture(scope="session")
async def app_fixture(http_settings: Settings) -> AsyncGenerator[FastAPI, None]:
    """FastAPI application instance shared across all HTTP tests in the session."""
    app = FastAPI(title="MR Review API (test)")
    app.include_router(hosts_router)
    app.include_router(repos_router)
    app.include_router(reviews_router)
    register_vcs_error_handlers(app)

    container = create_api_container(http_settings)
    setup_dishka(container, app)
    yield app
    await container.close()


@pytest_asyncio.fixture
async def client(app_fixture: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """Per-test async HTTP client backed by the ASGI app (no real network)."""
    async with AsyncClient(
        transport=ASGITransport(app=app_fixture),
        base_url="http://test",
    ) as ac:
        yield ac
