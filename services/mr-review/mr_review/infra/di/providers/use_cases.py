"""Use case providers."""

from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
from dishka import Provider, Scope, provide

from mr_review.core.ai_providers.entities import AIProvider as AIProviderEntity
from mr_review.core.hosts.entities import Host
from mr_review.core.vcs.protocols import VCSProvider, VCSProviderFactory
from mr_review.infra.ai.claude import ClaudeProvider
from mr_review.infra.ai.openai_compat import OpenAICompatProvider
from mr_review.infra.repositories.ai_provider import FileAIProviderRepository
from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.repositories.review import FileReviewRepository
from mr_review.infra.vcs.cache import VCSCache
from mr_review.infra.vcs.factory import get_cached_provider
from mr_review.use_cases.ai_providers.create_ai_provider import CreateAIProviderUseCase
from mr_review.use_cases.ai_providers.delete_ai_provider import DeleteAIProviderUseCase
from mr_review.use_cases.ai_providers.list_ai_providers import ListAIProvidersUseCase
from mr_review.use_cases.ai_providers.list_provider_models import ListProviderModelsUseCase
from mr_review.use_cases.ai_providers.update_ai_provider import UpdateAIProviderUseCase
from mr_review.use_cases.hosts.check_connection import CheckConnectionUseCase
from mr_review.use_cases.hosts.create_host import CreateHostUseCase
from mr_review.use_cases.hosts.delete_host import DeleteHostUseCase
from mr_review.use_cases.hosts.list_hosts import ListHostsUseCase
from mr_review.use_cases.hosts.toggle_favourite_repo import ToggleFavouriteRepoUseCase
from mr_review.use_cases.hosts.update_host import UpdateHostUseCase
from mr_review.use_cases.mrs.get_mr import GetMRUseCase
from mr_review.use_cases.mrs.get_mr_diff import GetMRDiffUseCase
from mr_review.use_cases.mrs.list_inbox_mrs import ListInboxMRsUseCase
from mr_review.use_cases.mrs.list_mrs import ListMRsUseCase
from mr_review.use_cases.mrs.list_repos import ListReposUseCase
from mr_review.use_cases.reviews.create_iteration import CreateIterationUseCase
from mr_review.use_cases.reviews.create_review import CreateReviewUseCase
from mr_review.use_cases.reviews.delete_review import DeleteReviewUseCase
from mr_review.use_cases.reviews.dispatch_review import DispatchReviewUseCase
from mr_review.use_cases.reviews.get_review import GetReviewUseCase
from mr_review.use_cases.reviews.get_review_context import GetReviewContextUseCase
from mr_review.use_cases.reviews.get_review_diff import GetReviewDiffUseCase
from mr_review.use_cases.reviews.get_review_prompt import GetReviewPromptUseCase
from mr_review.use_cases.reviews.import_response import ImportResponseUseCase
from mr_review.use_cases.reviews.list_reviews import ListReviewsUseCase
from mr_review.use_cases.reviews.post_review import PostReviewUseCase
from mr_review.use_cases.reviews.update_review import UpdateReviewUseCase


async def _ai_dispatcher_factory(
    ai_provider: AIProviderEntity,
    prompt: str,
    model: str | None,
    temperature: float | None,
    reasoning_budget: int | None,
    reasoning_effort: str | None,
) -> AsyncIterator[str]:
    """Resolve the correct AI backend and return a streaming iterator of text chunks."""
    api_key = ai_provider.api_key.get_secret_value()
    if ai_provider.type == "claude":
        resolved_model = model or (ai_provider.models[0] if ai_provider.models else "claude-opus-4-5")
        ai: ClaudeProvider | OpenAICompatProvider = ClaudeProvider(
            api_key=api_key,
            model=resolved_model,
            ssl_verify=ai_provider.ssl_verify,
            timeout=ai_provider.timeout,
            temperature=temperature,
            reasoning_budget=reasoning_budget,
        )
    else:
        resolved_model = model or (ai_provider.models[0] if ai_provider.models else "gpt-4o")
        ai = OpenAICompatProvider(
            api_key=api_key,
            model=resolved_model,
            base_url=ai_provider.base_url or None,
            ssl_verify=ai_provider.ssl_verify,
            timeout=ai_provider.timeout,
            temperature=temperature,
            reasoning_budget=reasoning_budget,
            reasoning_effort=reasoning_effort,
        )
    return await ai.dispatch(prompt)


async def _model_lister(ai_provider: AIProviderEntity) -> list[str]:
    """Resolve the correct AI backend and list its available models."""
    api_key = ai_provider.api_key.get_secret_value()
    if ai_provider.type == "claude":
        ai: ClaudeProvider | OpenAICompatProvider = ClaudeProvider(
            api_key=api_key,
            ssl_verify=ai_provider.ssl_verify,
            timeout=ai_provider.timeout,
        )
    else:
        ai = OpenAICompatProvider(
            api_key=api_key,
            base_url=ai_provider.base_url or None,
            ssl_verify=ai_provider.ssl_verify,
            timeout=ai_provider.timeout,
        )
    return await ai.list_models()


def _make_vcs_factory(vcs_client: httpx.AsyncClient, vcs_cache: VCSCache) -> VCSProviderFactory:
    """Return a VCSProviderFactory closed over the current request's client and app-scoped cache."""

    def factory(host: Host) -> VCSProvider:
        return get_cached_provider(host, vcs_client, vcs_cache)

    return factory


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
    def get_check_connection_use_case(
        self,
        repo: FileHostRepository,
        vcs_cache: VCSCache,
        vcs_client: httpx.AsyncClient,
    ) -> CheckConnectionUseCase:
        return CheckConnectionUseCase(host_repo=repo, vcs_factory=_make_vcs_factory(vcs_client, vcs_cache))

    @provide
    def get_toggle_favourite_repo_use_case(self, repo: FileHostRepository) -> ToggleFavouriteRepoUseCase:
        return ToggleFavouriteRepoUseCase(repo)

    @provide
    def get_list_repos_use_case(
        self, repo: FileHostRepository, vcs_cache: VCSCache, vcs_client: httpx.AsyncClient
    ) -> ListReposUseCase:
        return ListReposUseCase(host_repo=repo, vcs_factory=_make_vcs_factory(vcs_client, vcs_cache))

    @provide
    def get_list_mrs_use_case(
        self, repo: FileHostRepository, vcs_cache: VCSCache, vcs_client: httpx.AsyncClient
    ) -> ListMRsUseCase:
        return ListMRsUseCase(host_repo=repo, vcs_factory=_make_vcs_factory(vcs_client, vcs_cache))

    @provide
    def get_get_mr_use_case(
        self, repo: FileHostRepository, vcs_cache: VCSCache, vcs_client: httpx.AsyncClient
    ) -> GetMRUseCase:
        return GetMRUseCase(host_repo=repo, vcs_factory=_make_vcs_factory(vcs_client, vcs_cache))

    @provide
    def get_get_mr_diff_use_case(
        self, repo: FileHostRepository, vcs_cache: VCSCache, vcs_client: httpx.AsyncClient
    ) -> GetMRDiffUseCase:
        return GetMRDiffUseCase(host_repo=repo, vcs_factory=_make_vcs_factory(vcs_client, vcs_cache))

    @provide
    def get_list_inbox_mrs_use_case(
        self, repo: FileHostRepository, vcs_cache: VCSCache, vcs_client: httpx.AsyncClient
    ) -> ListInboxMRsUseCase:
        return ListInboxMRsUseCase(host_repo=repo, vcs_factory=_make_vcs_factory(vcs_client, vcs_cache))

    @provide
    def get_create_review_use_case(self, repo: FileReviewRepository) -> CreateReviewUseCase:
        return CreateReviewUseCase(repo)

    @provide
    def get_create_iteration_use_case(self, repo: FileReviewRepository) -> CreateIterationUseCase:
        return CreateIterationUseCase(repo)

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
        vcs_cache: VCSCache,
        vcs_client: httpx.AsyncClient,
    ) -> GetReviewDiffUseCase:
        return GetReviewDiffUseCase(
            review_repo=review_repo,
            host_repo=host_repo,
            vcs_factory=_make_vcs_factory(vcs_client, vcs_cache),
        )

    @provide
    def get_get_review_context_use_case(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
        vcs_cache: VCSCache,
        vcs_client: httpx.AsyncClient,
    ) -> GetReviewContextUseCase:
        return GetReviewContextUseCase(
            review_repo=review_repo,
            host_repo=host_repo,
            vcs_factory=_make_vcs_factory(vcs_client, vcs_cache),
        )

    @provide
    def get_get_review_prompt_use_case(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
        vcs_cache: VCSCache,
        vcs_client: httpx.AsyncClient,
    ) -> GetReviewPromptUseCase:
        return GetReviewPromptUseCase(
            review_repo=review_repo,
            host_repo=host_repo,
            vcs_factory=_make_vcs_factory(vcs_client, vcs_cache),
        )

    @provide
    def get_dispatch_review_use_case(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
        ai_provider_repo: FileAIProviderRepository,
        vcs_cache: VCSCache,
        vcs_client: httpx.AsyncClient,
    ) -> DispatchReviewUseCase:
        return DispatchReviewUseCase(
            review_repo=review_repo,
            host_repo=host_repo,
            ai_provider_repo=ai_provider_repo,
            vcs_factory=_make_vcs_factory(vcs_client, vcs_cache),
            ai_dispatcher_factory=_ai_dispatcher_factory,
        )

    @provide
    def get_import_response_use_case(self, review_repo: FileReviewRepository) -> ImportResponseUseCase:
        return ImportResponseUseCase(review_repo=review_repo)

    @provide
    def get_post_review_use_case(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
        vcs_cache: VCSCache,
        vcs_client: httpx.AsyncClient,
    ) -> PostReviewUseCase:
        return PostReviewUseCase(
            review_repo=review_repo,
            host_repo=host_repo,
            vcs_factory=_make_vcs_factory(vcs_client, vcs_cache),
        )

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
        return ListProviderModelsUseCase(repo=repo, model_lister=_model_lister)
