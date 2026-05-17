import json
import os
from contextlib import suppress

import structlog
from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from mr_review.api.config import Settings
from mr_review.api.routers.health import router as health_router
from mr_review.api.routers.v1.ai_providers import router as ai_providers_v1_router
from mr_review.api.routers.v1.hosts import router as hosts_v1_router
from mr_review.api.routers.v1.repos import router as repos_v1_router
from mr_review.api.routers.v1.reviews import router as reviews_v1_router
from mr_review.api.routers.v1.system import router as system_v1_router
from mr_review.common.constants import SENSITIVE_LOG_FIELDS, SERVICE_NAME
from mr_review.common.logging import SensitiveDataFilter, configure_logging
from mr_review.infra.di.containers.api import create_api_container

logger = structlog.get_logger(__name__)

# Mutable container so main() can pre-load Settings for the factory
# without a global assignment (avoids PLW0603).
_settings_cache: list[Settings] = []


def create_app() -> FastAPI:
    """Factory function for uvicorn to create the app instance."""
    settings = _settings_cache[0] if _settings_cache else Settings()

    configure_logging(
        log_level=settings.logging.level,
        use_json_format=settings.logging.use_json,
        security_filter=SensitiveDataFilter(fields=SENSITIVE_LOG_FIELDS),
    )

    app = FastAPI(
        title=SERVICE_NAME,
        version=settings.get_app_version(),
        openapi_url="/system/openapi.json",
        docs_url="/system/docs",
        redoc_url="/system/redoc",
        redirect_slashes=False,
    )

    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors.allow_origins,
        allow_credentials=settings.cors.allow_credentials,
        allow_methods=settings.cors.allow_methods,
        allow_headers=settings.cors.allow_headers,
    )

    app.include_router(health_router)
    app.include_router(system_v1_router)
    app.include_router(hosts_v1_router)
    app.include_router(repos_v1_router)
    app.include_router(reviews_v1_router)
    app.include_router(ai_providers_v1_router)

    container = create_api_container(settings)
    setup_dishka(container, app)

    if settings.static_dir is not None:
        _mount_spa(app, settings)

    return app


def _mount_spa(app: FastAPI, settings: Settings) -> None:
    """Mount built frontend and add SPA fallback for client-side routing."""
    if settings.static_dir is None:
        raise ValueError("static_dir must be set before calling _mount_spa")
    static_dir = settings.static_dir
    index_html = static_dir / "index.html"

    # Serve hashed assets with long-lived cache
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    # In all-in-one mode the frontend is served by this same server, so the
    # API base URL must be relative (empty string) — the browser will resolve
    # /api/v1/... against the same host:port the user accessed the UI from.
    api_base_url = os.environ.get("MR_REVIEW__API_BASE_URL", "")
    config_js_content = (
        f"window.__APP_CONFIG__ = {{\n"
        f"  API_BASE_URL: {json.dumps(api_base_url)},\n"
        f'  APP_ENV: "production",\n'
        f"  BUILD_TIME: new Date().toISOString(),\n"
        f"  VERSION: {json.dumps(settings.get_app_version())},\n"
        f"}};\n"
    )

    @app.get("/config.js", include_in_schema=False)
    async def serve_config_js() -> PlainTextResponse:
        return PlainTextResponse(config_js_content, media_type="application/javascript")

    # SPA fallback — all unmatched routes return index.html so the React
    # router can handle navigation on the client side
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str, request: Request) -> FileResponse:  # noqa: ARG001
        return FileResponse(index_html)


def main() -> None:
    """Run server."""
    with suppress(ImportError):
        import uvloop  # noqa: PLC0415

        uvloop.install()

    settings = Settings()
    _settings_cache.append(settings)

    import uvicorn  # noqa: PLC0415

    logger.info(
        "Starting server",
        service=SERVICE_NAME,
        version=settings.get_app_version(),
        host=settings.server.host,
        port=settings.server.port,
        workers=settings.server.workers,
        cpu_count=os.cpu_count(),
    )

    uvicorn.run(
        "mr_review.api.entrypoint:create_app",
        factory=True,
        **settings.get_uvicorn_kwargs(),
    )


if __name__ == "__main__":
    main()
