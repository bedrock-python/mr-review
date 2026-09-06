"""The all-in-one server serves the built UI and falls back to it for unmatched paths.

The fallback is why a health probe must name a real route: an unmatched path is
answered with the SPA shell and a 200, not a 404.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from mr_review.api.config import Settings
from mr_review.api.entrypoint import _mount_spa
from mr_review.api.routers.health import router as health_router

pytestmark = [pytest.mark.integration, pytest.mark.http]

_SHELL = "<!doctype html><title>mr-review</title>"


@pytest.fixture
def spa_app(tmp_path: Path) -> FastAPI:
    """An API with the built UI mounted, as the all-in-one image runs it."""
    static_dir = tmp_path / "static"
    (static_dir / "assets").mkdir(parents=True)
    (static_dir / "index.html").write_text(_SHELL, encoding="utf-8")
    (tmp_path / "reviews").mkdir()

    app = FastAPI()
    app.include_router(health_router)
    _mount_spa(app, Settings(data_dir=tmp_path, static_dir=static_dir))
    return app


@pytest_asyncio.fixture
async def spa_client(spa_app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client backed by the SPA-mounted ASGI app (no real network)."""
    async with AsyncClient(transport=ASGITransport(app=spa_app), base_url="http://test") as ac:
        yield ac


async def test__liveness__spa_mounted__answers_with_json(spa_client: AsyncClient) -> None:
    """GET /system/health/livez is served by the health router, not by the fallback."""
    # Arrange / Act
    response = await spa_client.get("/system/health/livez")

    # Assert
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize("path", ["/health", "/no/such/page"])
async def test__unmatched_path__spa_mounted__returns_the_shell_with_200(spa_client: AsyncClient, path: str) -> None:
    """Any path the API does not serve — /health included — falls back to index.html."""
    # Arrange / Act
    response = await spa_client.get(path)

    # Assert
    assert response.status_code == 200
    assert response.text == _SHELL
