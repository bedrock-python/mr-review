from __future__ import annotations

from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from mr_review.infra.db.database import init_db
from mr_review.infra.repositories.host import SQLiteHostRepository
from mr_review.infra.repositories.review import SQLiteReviewRepository
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    await init_db(engine)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session, session.begin():
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def host_repo(db_session: AsyncSession) -> SQLiteHostRepository:
    return SQLiteHostRepository(db_session)


@pytest_asyncio.fixture
async def review_repo(db_session: AsyncSession) -> SQLiteReviewRepository:
    return SQLiteReviewRepository(db_session)
