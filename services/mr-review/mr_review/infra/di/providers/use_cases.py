"""Use case providers."""

from dishka import Provider, Scope, provide

from mr_review.infra.repositories.ai_provider import FileAIProviderRepository
from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.repositories.review import FileReviewRepository
from mr_review.use_cases.ai_providers.create_ai_provider import CreateAIProviderUseCase
from mr_review.use_cases.ai_providers.delete_ai_provider import DeleteAIProviderUseCase
from mr_review.use_cases.ai_providers.list_ai_providers import ListAIProvidersUseCase
from mr_review.use_cases.ai_providers.list_provider_models import ListProviderModelsUseCase
from mr_review.use_cases.ai_providers.update_ai_provider import UpdateAIProviderUseCase
from mr_review.use_cases.hosts.create_host import CreateHostUseCase
from mr_review.use_cases.hosts.delete_host import DeleteHostUseCase
from mr_review.use_cases.hosts.list_hosts import ListHostsUseCase
from mr_review.use_cases.hosts.test_connection import TestConnectionUseCase
from mr_review.use_cases.hosts.update_host import UpdateHostUseCase
from mr_review.use_cases.mrs.get_mr import GetMRUseCase
from mr_review.use_cases.mrs.get_mr_diff import GetMRDiffUseCase
from mr_review.use_cases.mrs.list_mrs import ListMRsUseCase
from mr_review.use_cases.mrs.list_repos import ListReposUseCase
from mr_review.use_cases.reviews.create_review import CreateReviewUseCase
from mr_review.use_cases.reviews.delete_review import DeleteReviewUseCase
from mr_review.use_cases.reviews.dispatch_review import DispatchReviewUseCase
from mr_review.use_cases.reviews.get_review import GetReviewUseCase
from mr_review.use_cases.reviews.get_review_diff import GetReviewDiffUseCase
from mr_review.use_cases.reviews.get_review_prompt import GetReviewPromptUseCase
from mr_review.use_cases.reviews.import_response import ImportResponseUseCase
from mr_review.use_cases.reviews.list_reviews import ListReviewsUseCase
from mr_review.use_cases.reviews.post_review import PostReviewUseCase
from mr_review.use_cases.reviews.update_review import UpdateReviewUseCase


class UseCaseProvider(Provider):
    """Provider for use cases."""

    scope = Scope.REQUEST

    @provide
    def get_create_host_use_case(self, repo: FileHostRepository) -> CreateHostUseCase:
        return CreateHostUseCase(repo)

    @provide
    def get_list_hosts_use_case(self, repo: FileHostRepository) -> ListHostsUseCase:
        return ListHostsUseCase(repo)

    @provide
    def get_delete_host_use_case(self, repo: FileHostRepository) -> DeleteHostUseCase:
        return DeleteHostUseCase(repo)

    @provide
    def get_update_host_use_case(self, repo: FileHostRepository) -> UpdateHostUseCase:
        return UpdateHostUseCase(repo)

    @provide
    def get_test_connection_use_case(self, repo: FileHostRepository) -> TestConnectionUseCase:
        return TestConnectionUseCase(repo)

    @provide
    def get_list_repos_use_case(self, repo: FileHostRepository) -> ListReposUseCase:
        return ListReposUseCase(repo)

    @provide
    def get_list_mrs_use_case(self, repo: FileHostRepository) -> ListMRsUseCase:
        return ListMRsUseCase(repo)

    @provide
    def get_get_mr_use_case(self, repo: FileHostRepository) -> GetMRUseCase:
        return GetMRUseCase(repo)

    @provide
    def get_get_mr_diff_use_case(self, repo: FileHostRepository) -> GetMRDiffUseCase:
        return GetMRDiffUseCase(repo)

    @provide
    def get_create_review_use_case(self, repo: FileReviewRepository) -> CreateReviewUseCase:
        return CreateReviewUseCase(repo)

    @provide
    def get_list_reviews_use_case(self, repo: FileReviewRepository) -> ListReviewsUseCase:
        return ListReviewsUseCase(repo)

    @provide
    def get_get_review_use_case(self, repo: FileReviewRepository) -> GetReviewUseCase:
        return GetReviewUseCase(repo)

    @provide
    def get_update_review_use_case(self, repo: FileReviewRepository) -> UpdateReviewUseCase:
        return UpdateReviewUseCase(repo)

    @provide
    def get_delete_review_use_case(self, repo: FileReviewRepository) -> DeleteReviewUseCase:
        return DeleteReviewUseCase(repo)

    @provide
    def get_get_review_diff_use_case(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
    ) -> GetReviewDiffUseCase:
        return GetReviewDiffUseCase(review_repo=review_repo, host_repo=host_repo)

    @provide
    def get_get_review_prompt_use_case(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
    ) -> GetReviewPromptUseCase:
        return GetReviewPromptUseCase(review_repo=review_repo, host_repo=host_repo)

    @provide
    def get_dispatch_review_use_case(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
        ai_provider_repo: FileAIProviderRepository,
    ) -> DispatchReviewUseCase:
        return DispatchReviewUseCase(
            review_repo=review_repo,
            host_repo=host_repo,
            ai_provider_repo=ai_provider_repo,
        )

    @provide
    def get_import_response_use_case(self, review_repo: FileReviewRepository) -> ImportResponseUseCase:
        return ImportResponseUseCase(review_repo=review_repo)

    @provide
    def get_post_review_use_case(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
    ) -> PostReviewUseCase:
        return PostReviewUseCase(review_repo=review_repo, host_repo=host_repo)

    @provide
    def get_create_ai_provider_use_case(self, repo: FileAIProviderRepository) -> CreateAIProviderUseCase:
        return CreateAIProviderUseCase(repo)

    @provide
    def get_list_ai_providers_use_case(self, repo: FileAIProviderRepository) -> ListAIProvidersUseCase:
        return ListAIProvidersUseCase(repo)

    @provide
    def get_update_ai_provider_use_case(self, repo: FileAIProviderRepository) -> UpdateAIProviderUseCase:
        return UpdateAIProviderUseCase(repo)

    @provide
    def get_delete_ai_provider_use_case(self, repo: FileAIProviderRepository) -> DeleteAIProviderUseCase:
        return DeleteAIProviderUseCase(repo)

    @provide
    def get_list_provider_models_use_case(self, repo: FileAIProviderRepository) -> ListProviderModelsUseCase:
        return ListProviderModelsUseCase(repo)
