from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from dishka import AsyncContainer, make_async_container
from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from mr_review.infra.di.providers import DatabaseProvider, RepositoryProvider, UseCaseProvider
from mr_review.settings import Settings


def create_app() -> FastAPI:
    settings = Settings()

    container: AsyncContainer = make_async_container(
        DatabaseProvider(),
        RepositoryProvider(),
        UseCaseProvider(),
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        await container.close()

    app = FastAPI(
        title="MR Review",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from api.routers.hosts import router as hosts_router
    from api.routers.repos import router as repos_router
    from api.routers.reviews import router as reviews_router

    app.include_router(hosts_router)
    app.include_router(repos_router)
    app.include_router(reviews_router)

    setup_dishka(container, app)

    return app


app = create_app()
