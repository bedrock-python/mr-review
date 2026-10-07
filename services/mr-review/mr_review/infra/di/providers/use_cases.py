"""Use case providers."""

from __future__ import annotations

from collections.abc import AsyncGenerator, AsyncIterator

from dishka import Provider, Scope, provide

from mr_review.core.ai.capabilities import resolve_capabilities
from mr_review.core.ai.entities import AIStreamItem, DispatchOptions
from mr_review.core.ai.errors import AIProviderError
from mr_review.core.ai.generation import plan_generation
from mr_review.core.ai.protocols import AIDispatcherFactory, AIFenceRegistry
from mr_review.core.ai_providers.entities import AIProvider as AIProviderEntity
from mr_review.core.hosts.entities import Host
from mr_review.core.vcs.protocols import VCSProvider, VCSProviderFactory
from mr_review.infra.ai.claude import ClaudeProvider
from mr_review.infra.ai.openai_compat import OpenAICompatProvider
from mr_review.infra.repositories.ai_provider import FileAIProviderRepository
from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.repositories.review import FileReviewRepository
from mr_review.infra.repositories.review_preset import FileReviewPresetRepository
from mr_review.infra.vcs.cache import VCSCache
from mr_review.use_cases.ai_providers.create_ai_provider import CreateAIProviderUseCase
from mr_review.use_cases.ai_providers.delete_ai_provider import DeleteAIProviderUseCase
from mr_review.use_cases.ai_providers.get_model_capabilities import GetModelCapabilitiesUseCase
from mr_review.use_cases.ai_providers.list_ai_providers import ListAIProvidersUseCase
from mr_review.use_cases.ai_providers.list_provider_models import ListProviderModelsUseCase
from mr_review.use_cases.ai_providers.preview_provider_models import PreviewProviderModelsUseCase
from mr_review.use_cases.ai_providers.update_ai_provider import UpdateAIProviderUseCase
from mr_review.use_cases.export_data import ExportDataUseCase
from mr_review.use_cases.hosts.add_repo_by_url import AddRepoByUrlUseCase
from mr_review.use_cases.hosts.check_connection import CheckConnectionUseCase
from mr_review.use_cases.hosts.create_host import CreateHostUseCase
from mr_review.use_cases.hosts.delete_host import DeleteHostUseCase
from mr_review.use_cases.hosts.invalidate_host_cache import InvalidateHostCacheUseCase
from mr_review.use_cases.hosts.list_hosts import ListHostsUseCase
from mr_review.use_cases.hosts.toggle_favourite_repo import ToggleFavouriteRepoUseCase
from mr_review.use_cases.hosts.update_host import UpdateHostUseCase
from mr_review.use_cases.import_data import ImportDataUseCase
from mr_review.use_cases.mrs.get_mr import GetMRUseCase
from mr_review.use_cases.mrs.get_mr_diff import GetMRDiffUseCase
from mr_review.use_cases.mrs.list_inbox_mrs import ListInboxMRsUseCase
from mr_review.use_cases.mrs.list_mrs import ListMRsUseCase
from mr_review.use_cases.mrs.list_repos import ListReposUseCase
from mr_review.use_cases.preview_import import PreviewImportUseCase
from mr_review.use_cases.review_presets.create_review_preset import CreateReviewPresetUseCase
from mr_review.use_cases.review_presets.delete_review_preset import DeleteReviewPresetUseCase
from mr_review.use_cases.review_presets.get_review_preset import GetReviewPresetUseCase
from mr_review.use_cases.review_presets.list_review_presets import ListReviewPresetsUseCase
from mr_review.use_cases.review_presets.update_review_preset import UpdateReviewPresetUseCase
from mr_review.use_cases.reviews.create_code_review import CreateCodeReviewUseCase
from mr_review.use_cases.reviews.create_comment import CreateCommentUseCase
from mr_review.use_cases.reviews.create_iteration import CreateIterationUseCase
from mr_review.use_cases.reviews.create_review import CreateReviewUseCase
from mr_review.use_cases.reviews.delete_comment import DeleteCommentUseCase
from mr_review.use_cases.reviews.delete_review import DeleteReviewUseCase
from mr_review.use_cases.reviews.dispatch_review import DispatchReviewUseCase
from mr_review.use_cases.reviews.get_iteration_raw_response import GetIterationRawResponseUseCase
from mr_review.use_cases.reviews.get_review import GetReviewUseCase
from mr_review.use_cases.reviews.get_review_context import GetReviewContextUseCase
from mr_review.use_cases.reviews.get_review_diff import GetReviewDiffUseCase
from mr_review.use_cases.reviews.get_review_prompt import GetReviewPromptUseCase
from mr_review.use_cases.reviews.import_response import ImportResponseUseCase
from mr_review.use_cases.reviews.list_excluded_files import ListExcludedFilesUseCase
from mr_review.use_cases.reviews.list_reviews import ListReviewsUseCase
from mr_review.use_cases.reviews.post_review import PostReviewUseCase
from mr_review.use_cases.reviews.posting_registry import PostingRegistry
from mr_review.use_cases.reviews.reparse_iteration import ReparseIterationUseCase
from mr_review.use_cases.reviews.update_review import UpdateReviewUseCase


def _build_ai_backend(ai_provider: AIProviderEntity) -> ClaudeProvider | OpenAICompatProvider:
    """The backend client for ``ai_provider``, configured from its saved (or previewed) settings."""
    api_key = ai_provider.api_key.get_secret_value()
    if ai_provider.type == "claude":
        return ClaudeProvider(
            api_key,
            base_url=ai_provider.base_url or None,
            ssl_verify=ai_provider.ssl_verify,
            timeout=ai_provider.timeout,
        )
    return OpenAICompatProvider(
        api_key,
        provider_type=ai_provider.type,
        base_url=ai_provider.base_url or None,
        ssl_verify=ai_provider.ssl_verify,
        timeout=ai_provider.timeout,
    )


async def _fenced_stream(
    fence_registry: AIFenceRegistry,
    ai_provider: AIProviderEntity,
    inner: AsyncIterator[AIStreamItem],
) -> AsyncGenerator[AIStreamItem, None]:
    """Hold one fence slot for ``ai_provider`` from first chunk through close/error/cancel."""
    async with fence_registry.acquire(ai_provider):
        async for item in inner:
            yield item


def _make_ai_dispatcher_factory(fence_registry: AIFenceRegistry) -> AIDispatcherFactory:
    """Build a streaming AI dispatcher factory whose output is fenced per provider.

    The options are planned against the model's capabilities first, so the backend only ever
    sends settings the model accepts.
    """

    async def factory(
        ai_provider: AIProviderEntity, prompt: str, options: DispatchOptions
    ) -> AsyncIterator[AIStreamItem]:
        if not options.model:
            raise AIProviderError("No model selected — pick one in the dispatch settings")
        caps = resolve_capabilities(ai_provider.type, options.model, base_url=ai_provider.base_url)
        plan = plan_generation(caps, options)
        backend = _build_ai_backend(ai_provider)
        return _fenced_stream(fence_registry, ai_provider, backend.dispatch(prompt, plan))

    return factory


async def _model_lister(ai_provider: AIProviderEntity) -> list[str]:
    """Resolve the correct AI backend and list its available models."""
    return await _build_ai_backend(ai_provider).list_models()


def _make_vcs_factory(vcs_cache: VCSCache) -> VCSProviderFactory:
    """Return a VCSProviderFactory backed by the app-scoped provider registry."""

    def factory(host: Host) -> VCSProvider:
        return vcs_cache.get(host)

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
    def get_delete_host_use_case(self, repo: FileHostRepository, vcs_cache: VCSCache) -> DeleteHostUseCase:
        return DeleteHostUseCase(repo, vcs_cache)

    @provide
    def get_update_host_use_case(self, repo: FileHostRepository, vcs_cache: VCSCache) -> UpdateHostUseCase:
        return UpdateHostUseCase(repo, vcs_cache)

    @provide
    def get_invalidate_host_cache_use_case(
        self, repo: FileHostRepository, vcs_cache: VCSCache
    ) -> InvalidateHostCacheUseCase:
        return InvalidateHostCacheUseCase(host_repo=repo, vcs_cache=vcs_cache)

    @provide
    def get_check_connection_use_case(
        self,
        repo: FileHostRepository,
        vcs_cache: VCSCache,
    ) -> CheckConnectionUseCase:
        return CheckConnectionUseCase(host_repo=repo, vcs_factory=_make_vcs_factory(vcs_cache))

    @provide
    def get_toggle_favourite_repo_use_case(self, repo: FileHostRepository) -> ToggleFavouriteRepoUseCase:
        return ToggleFavouriteRepoUseCase(repo)

    @provide
    def get_add_repo_by_url_use_case(self, repo: FileHostRepository, vcs_cache: VCSCache) -> AddRepoByUrlUseCase:
        return AddRepoByUrlUseCase(host_repo=repo, vcs_factory=_make_vcs_factory(vcs_cache))

    @provide
    def get_list_repos_use_case(self, repo: FileHostRepository, vcs_cache: VCSCache) -> ListReposUseCase:
        return ListReposUseCase(host_repo=repo, vcs_factory=_make_vcs_factory(vcs_cache))

    @provide
    def get_list_mrs_use_case(self, repo: FileHostRepository, vcs_cache: VCSCache) -> ListMRsUseCase:
        return ListMRsUseCase(host_repo=repo, vcs_factory=_make_vcs_factory(vcs_cache))

    @provide
    def get_get_mr_use_case(self, repo: FileHostRepository, vcs_cache: VCSCache) -> GetMRUseCase:
        return GetMRUseCase(host_repo=repo, vcs_factory=_make_vcs_factory(vcs_cache))

    @provide
    def get_get_mr_diff_use_case(self, repo: FileHostRepository, vcs_cache: VCSCache) -> GetMRDiffUseCase:
        return GetMRDiffUseCase(host_repo=repo, vcs_factory=_make_vcs_factory(vcs_cache))

    @provide
    def get_list_inbox_mrs_use_case(self, repo: FileHostRepository, vcs_cache: VCSCache) -> ListInboxMRsUseCase:
        return ListInboxMRsUseCase(host_repo=repo, vcs_factory=_make_vcs_factory(vcs_cache))

    @provide
    def get_create_review_use_case(self, repo: FileReviewRepository) -> CreateReviewUseCase:
        return CreateReviewUseCase(repo)

    @provide
    def get_create_code_review_use_case(self, repo: FileReviewRepository) -> CreateCodeReviewUseCase:
        return CreateCodeReviewUseCase(repo)

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
    def get_update_review_use_case(self, repo: FileReviewRepository, registry: PostingRegistry) -> UpdateReviewUseCase:
        return UpdateReviewUseCase(repo, registry)

    @provide
    def get_create_comment_use_case(
        self, repo: FileReviewRepository, registry: PostingRegistry
    ) -> CreateCommentUseCase:
        return CreateCommentUseCase(repo, registry)

    @provide
    def get_delete_comment_use_case(
        self, repo: FileReviewRepository, registry: PostingRegistry
    ) -> DeleteCommentUseCase:
        return DeleteCommentUseCase(repo, registry)

    @provide
    def get_delete_review_use_case(self, repo: FileReviewRepository) -> DeleteReviewUseCase:
        return DeleteReviewUseCase(repo)

    @provide
    def get_get_review_diff_use_case(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
        vcs_cache: VCSCache,
    ) -> GetReviewDiffUseCase:
        return GetReviewDiffUseCase(
            review_repo=review_repo,
            host_repo=host_repo,
            vcs_factory=_make_vcs_factory(vcs_cache),
        )

    @provide
    def get_get_review_context_use_case(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
        vcs_cache: VCSCache,
    ) -> GetReviewContextUseCase:
        return GetReviewContextUseCase(
            review_repo=review_repo,
            host_repo=host_repo,
            vcs_factory=_make_vcs_factory(vcs_cache),
        )

    @provide
    def get_get_review_prompt_use_case(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
        vcs_cache: VCSCache,
        preset_repo: FileReviewPresetRepository,
    ) -> GetReviewPromptUseCase:
        return GetReviewPromptUseCase(
            review_repo=review_repo,
            host_repo=host_repo,
            vcs_factory=_make_vcs_factory(vcs_cache),
            preset_repo=preset_repo,
        )

    @provide
    def get_list_excluded_files_use_case(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
        vcs_cache: VCSCache,
    ) -> ListExcludedFilesUseCase:
        return ListExcludedFilesUseCase(
            review_repo=review_repo,
            host_repo=host_repo,
            vcs_factory=_make_vcs_factory(vcs_cache),
        )

    @provide
    def get_list_review_presets_use_case(self, repo: FileReviewPresetRepository) -> ListReviewPresetsUseCase:
        return ListReviewPresetsUseCase(repo)

    @provide
    def get_get_review_preset_use_case(self, repo: FileReviewPresetRepository) -> GetReviewPresetUseCase:
        return GetReviewPresetUseCase(repo)

    @provide
    def get_create_review_preset_use_case(self, repo: FileReviewPresetRepository) -> CreateReviewPresetUseCase:
        return CreateReviewPresetUseCase(repo)

    @provide
    def get_update_review_preset_use_case(self, repo: FileReviewPresetRepository) -> UpdateReviewPresetUseCase:
        return UpdateReviewPresetUseCase(repo)

    @provide
    def get_delete_review_preset_use_case(self, repo: FileReviewPresetRepository) -> DeleteReviewPresetUseCase:
        return DeleteReviewPresetUseCase(repo)

    @provide
    def get_dispatch_review_use_case(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
        ai_provider_repo: FileAIProviderRepository,
        vcs_cache: VCSCache,
        fence_registry: AIFenceRegistry,
        preset_repo: FileReviewPresetRepository,
    ) -> DispatchReviewUseCase:
        return DispatchReviewUseCase(
            review_repo=review_repo,
            host_repo=host_repo,
            ai_provider_repo=ai_provider_repo,
            vcs_factory=_make_vcs_factory(vcs_cache),
            ai_dispatcher_factory=_make_ai_dispatcher_factory(fence_registry),
            preset_repo=preset_repo,
        )

    @provide
    def get_import_response_use_case(self, review_repo: FileReviewRepository) -> ImportResponseUseCase:
        return ImportResponseUseCase(review_repo=review_repo)

    @provide
    def get_reparse_iteration_use_case(self, review_repo: FileReviewRepository) -> ReparseIterationUseCase:
        return ReparseIterationUseCase(review_repo=review_repo)

    @provide
    def get_iteration_raw_response_use_case(self, review_repo: FileReviewRepository) -> GetIterationRawResponseUseCase:
        return GetIterationRawResponseUseCase(review_repo=review_repo)

    @provide(scope=Scope.APP)
    def get_posting_registry(self) -> PostingRegistry:
        """One for the process: it is what stops two requests from posting the same iteration at once."""
        return PostingRegistry()

    @provide
    def get_post_review_use_case(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
        vcs_cache: VCSCache,
        registry: PostingRegistry,
    ) -> PostReviewUseCase:
        return PostReviewUseCase(
            review_repo=review_repo,
            host_repo=host_repo,
            vcs_factory=_make_vcs_factory(vcs_cache),
            registry=registry,
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

    @provide
    def get_preview_provider_models_use_case(self, repo: FileAIProviderRepository) -> PreviewProviderModelsUseCase:
        return PreviewProviderModelsUseCase(repo=repo, model_lister=_model_lister)

    @provide
    def get_model_capabilities_use_case(self, repo: FileAIProviderRepository) -> GetModelCapabilitiesUseCase:
        return GetModelCapabilitiesUseCase(repo)

    @provide
    def get_export_data_use_case(
        self,
        host_repo: FileHostRepository,
        ai_provider_repo: FileAIProviderRepository,
        review_repo: FileReviewRepository,
    ) -> ExportDataUseCase:
        return ExportDataUseCase(
            host_repo=host_repo,
            ai_provider_repo=ai_provider_repo,
            review_repo=review_repo,
        )

    @provide
    def get_import_data_use_case(
        self,
        host_repo: FileHostRepository,
        ai_provider_repo: FileAIProviderRepository,
        review_repo: FileReviewRepository,
    ) -> ImportDataUseCase:
        return ImportDataUseCase(
            host_repo=host_repo,
            ai_provider_repo=ai_provider_repo,
            review_repo=review_repo,
        )

    @provide
    def get_preview_import_use_case(
        self,
        host_repo: FileHostRepository,
        ai_provider_repo: FileAIProviderRepository,
        review_repo: FileReviewRepository,
    ) -> PreviewImportUseCase:
        return PreviewImportUseCase(
            host_repo=host_repo,
            ai_provider_repo=ai_provider_repo,
            review_repo=review_repo,
        )
