from __future__ import annotations

from collections.abc import AsyncIterator

from dishka import Provider, Scope, provide
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from mr_review.infra.db.database import create_engine, create_session_factory, init_db
from mr_review.infra.repositories.host import SQLiteHostRepository
from mr_review.infra.repositories.review import SQLiteReviewRepository
from mr_review.settings import Settings
from mr_review.use_cases.hosts.create_host import CreateHostUseCase
from mr_review.use_cases.hosts.delete_host import DeleteHostUseCase
from mr_review.use_cases.hosts.list_hosts import ListHostsUseCase
from mr_review.use_cases.hosts.test_connection import TestConnectionUseCase
from mr_review.use_cases.mrs.get_mr import GetMRUseCase
from mr_review.use_cases.mrs.get_mr_diff import GetMRDiffUseCase
from mr_review.use_cases.mrs.list_mrs import ListMRsUseCase
from mr_review.use_cases.mrs.list_repos import ListReposUseCase
from mr_review.use_cases.reviews.create_review import CreateReviewUseCase
from mr_review.use_cases.reviews.dispatch_review import DispatchReviewUseCase
from mr_review.use_cases.reviews.get_review import GetReviewUseCase
from mr_review.use_cases.reviews.list_reviews import ListReviewsUseCase
from mr_review.use_cases.reviews.post_review import PostReviewUseCase
from mr_review.use_cases.reviews.update_review import UpdateReviewUseCase


class DatabaseProvider(Provider):
    scope = Scope.APP

    @provide
    def get_settings(self) -> Settings:
        return Settings()

    @provide
    async def get_engine(self, settings: Settings) -> AsyncIterator[AsyncEngine]:
        engine = create_engine(settings.db_path)
        await init_db(engine)
        yield engine
        await engine.dispose()

    @provide
    def get_session_factory(self, engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
        return create_session_factory(engine)


class RepositoryProvider(Provider):
    scope = Scope.REQUEST

    @provide
    async def get_session(
        self,
        session_factory: async_sessionmaker[AsyncSession],
    ) -> AsyncIterator[AsyncSession]:
        async with session_factory() as session, session.begin():
            yield session

    @provide
    def get_host_repository(self, session: AsyncSession) -> SQLiteHostRepository:
        return SQLiteHostRepository(session)

    @provide
    def get_review_repository(self, session: AsyncSession) -> SQLiteReviewRepository:
        return SQLiteReviewRepository(session)


class UseCaseProvider(Provider):
    scope = Scope.REQUEST

    @provide
    def get_create_host_use_case(self, repo: SQLiteHostRepository) -> CreateHostUseCase:
        return CreateHostUseCase(repo)

    @provide
    def get_list_hosts_use_case(self, repo: SQLiteHostRepository) -> ListHostsUseCase:
        return ListHostsUseCase(repo)

    @provide
    def get_delete_host_use_case(self, repo: SQLiteHostRepository) -> DeleteHostUseCase:
        return DeleteHostUseCase(repo)

    @provide
    def get_test_connection_use_case(self, repo: SQLiteHostRepository) -> TestConnectionUseCase:
        return TestConnectionUseCase(repo)

    @provide
    def get_list_repos_use_case(self, repo: SQLiteHostRepository) -> ListReposUseCase:
        return ListReposUseCase(repo)

    @provide
    def get_list_mrs_use_case(self, repo: SQLiteHostRepository) -> ListMRsUseCase:
        return ListMRsUseCase(repo)

    @provide
    def get_get_mr_use_case(self, repo: SQLiteHostRepository) -> GetMRUseCase:
        return GetMRUseCase(repo)

    @provide
    def get_get_mr_diff_use_case(self, repo: SQLiteHostRepository) -> GetMRDiffUseCase:
        return GetMRDiffUseCase(repo)

    @provide
    def get_create_review_use_case(self, repo: SQLiteReviewRepository) -> CreateReviewUseCase:
        return CreateReviewUseCase(repo)

    @provide
    def get_list_reviews_use_case(self, repo: SQLiteReviewRepository) -> ListReviewsUseCase:
        return ListReviewsUseCase(repo)

    @provide
    def get_get_review_use_case(self, repo: SQLiteReviewRepository) -> GetReviewUseCase:
        return GetReviewUseCase(repo)

    @provide
    def get_update_review_use_case(self, repo: SQLiteReviewRepository) -> UpdateReviewUseCase:
        return UpdateReviewUseCase(repo)

    @provide
    def get_dispatch_review_use_case(
        self,
        review_repo: SQLiteReviewRepository,
        host_repo: SQLiteHostRepository,
    ) -> DispatchReviewUseCase:
        return DispatchReviewUseCase(review_repo=review_repo, host_repo=host_repo)

    @provide
    def get_post_review_use_case(
        self,
        review_repo: SQLiteReviewRepository,
        host_repo: SQLiteHostRepository,
    ) -> PostReviewUseCase:
        return PostReviewUseCase(review_repo=review_repo, host_repo=host_repo)
