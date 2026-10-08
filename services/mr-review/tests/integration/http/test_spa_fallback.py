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
    (static_dir / "assets" / "app.js").write_text("console.log(1);", encoding="utf-8")
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


@pytest.mark.parametrize("path", ["/health", "/no/such/page", "/apiary"])
async def test__unmatched_path__spa_mounted__returns_the_shell_with_200(spa_client: AsyncClient, path: str) -> None:
    """Any path the API does not serve — /health included — falls back to index.html."""
    # Arrange / Act
    response = await spa_client.get(path)

    # Assert
    assert response.status_code == 200
    assert response.text == _SHELL


@pytest.mark.parametrize("path", ["/api", "/api/v1/no-such-endpoint", "/api/v2/reviews"])
async def test__unknown_api_path__spa_mounted__returns_json_404(spa_client: AsyncClient, path: str) -> None:
    """An API path no route serves answers a JSON 404, not the UI shell with a 200."""
    # Arrange / Act
    response = await spa_client.get(path)

    # Assert
    assert response.status_code == 404
    assert response.headers["content-type"] == "application/json"
    assert response.json() == {"detail": "Not Found"}


@pytest.mark.parametrize("path", ["/", "/some/client/route", "/assets/app.js", "/config.js"])
async def test__ui_response__spa_mounted__carries_the_security_headers(spa_client: AsyncClient, path: str) -> None:
    """The shell, the assets and config.js get the headers the nginx image sends with the UI."""
    # Arrange / Act
    response = await spa_client.get(path)

    # Assert
    assert response.status_code == 200
    csp = response.headers["content-security-policy"]
    assert "default-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp
    assert "connect-src 'self' https://api.github.com;" in csp
    # The web fonts ship with the UI: no third-party style or font host is allowed.
    assert "style-src 'self' 'unsafe-inline';" in csp
    assert "font-src 'self' data:;" in csp
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert response.headers["permissions-policy"] == "geolocation=(), microphone=(), camera=()"
    assert "strict-transport-security" not in response.headers


@pytest.mark.parametrize("path", ["/system/health/livez", "/api/v1/no-such-endpoint"])
async def test__api_and_system_responses__spa_mounted__get_no_csp(spa_client: AsyncClient, path: str) -> None:
    """JSON and the Swagger pages (CDN assets) are left without the UI's CSP."""
    # Arrange / Act
    response = await spa_client.get(path)

    # Assert
    assert "content-security-policy" not in response.headers


async def test__ui_behind_a_tls_proxy__spa_mounted__leaves_hsts_to_the_proxy(spa_app: FastAPI) -> None:
    """HSTS is opt-in at the proxy that terminates TLS, as for the web container."""
    # Arrange
    async with AsyncClient(transport=ASGITransport(app=spa_app), base_url="https://test") as client:
        # Act
        response = await client.get("/")

    # Assert
    assert "strict-transport-security" not in response.headers


async def test__api_on_another_origin__spa_mounted__is_allowed_by_connect_src(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """When config.js points the UI at an API elsewhere, the CSP lets the UI call that origin."""
    # Arrange
    monkeypatch.setenv("MR_REVIEW__API_BASE_URL", "https://api.example.com:9000/base/")
    static_dir = tmp_path / "static"
    (static_dir / "assets").mkdir(parents=True)
    (static_dir / "index.html").write_text(_SHELL, encoding="utf-8")
    app = FastAPI()
    _mount_spa(app, Settings(data_dir=tmp_path, static_dir=static_dir))

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Act
        response = await client.get("/")

    # Assert
    assert (
        "connect-src 'self' https://api.github.com https://api.example.com:9000;"
        in (response.headers["content-security-policy"])
    )
