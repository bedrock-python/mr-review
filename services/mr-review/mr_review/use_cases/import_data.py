"""Import data use case."""

from __future__ import annotations

from mr_review.core.ai_providers.entities import AIProvider
from mr_review.core.ai_providers.repositories import AIProviderRepository
from mr_review.core.export_import.encryption import decrypt_token
from mr_review.core.export_import.entities import ImportRequest, ImportResult
from mr_review.core.hosts.entities import Host
from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.reviews.entities import Review
from mr_review.core.reviews.repositories import ReviewRepository


class ImportDataUseCase:
    """Import data package (hosts, AI providers, reviews) into the system."""

    def __init__(
        self,
        host_repo: HostRepository,
        ai_provider_repo: AIProviderRepository,
        review_repo: ReviewRepository,
    ) -> None:
        self._host_repo = host_repo
        self._ai_provider_repo = ai_provider_repo
        self._review_repo = review_repo

    async def execute(self, request: ImportRequest) -> ImportResult:  # noqa: C901
        """Import data based on the request.

        Args:
            request: Import request with data and merge strategy

        Returns:
            ImportResult with counts and any errors

        Raises:
            ValueError: If data is encrypted but no password provided
        """
        # Validate password for encrypted data
        if request.data.encrypted and not request.decryption_password:
            msg = "Data is encrypted but no decryption password provided"
            raise ValueError(msg)

        result = ImportResult()

        # Import hosts
        for host in request.data.hosts:
            try:
                await self._import_host(host, request.merge_strategy, request.decryption_password, result)
            except Exception as e:
                result.errors.append(f"Failed to import host {host.name}: {e}")

        # Import AI providers
        for provider in request.data.ai_providers:
            try:
                await self._import_ai_provider(provider, request.merge_strategy, request.decryption_password, result)
            except Exception as e:
                result.errors.append(f"Failed to import AI provider {provider.name}: {e}")

        # Import reviews
        for review in request.data.reviews:
            try:
                await self._import_review(review, request.merge_strategy, result)
            except Exception as e:
                result.errors.append(f"Failed to import review {review.id}: {e}")

        return result

    async def _import_host(
        self, host: Host, strategy: str, decryption_password: str | None, result: ImportResult
    ) -> None:
        """Import a single host."""
        existing = await self._host_repo.get_by_id(host.id)

        if existing is not None:
            if strategy == "skip":
                result.hosts_skipped += 1
                return
            if strategy == "replace":
                await self._host_repo.delete(host.id)

        # Decrypt token if encrypted
        token = host.token.get_secret_value()
        if decryption_password:
            token = decrypt_token(token, decryption_password)

        await self._host_repo.create(
            name=host.name,
            type_=host.type,
            base_url=host.base_url,
            token=token,
            color=host.color,
            timeout=host.timeout,
        )
        result.hosts_imported += 1

    async def _import_ai_provider(
        self, provider: AIProvider, strategy: str, decryption_password: str | None, result: ImportResult
    ) -> None:
        """Import a single AI provider."""
        existing = await self._ai_provider_repo.get_by_id(provider.id)

        if existing is not None:
            if strategy == "skip":
                result.ai_providers_skipped += 1
                return
            if strategy == "replace":
                await self._ai_provider_repo.delete(provider.id)

        # Decrypt API key if encrypted
        api_key = provider.api_key.get_secret_value()
        if decryption_password:
            api_key = decrypt_token(api_key, decryption_password)

        await self._ai_provider_repo.create(
            name=provider.name,
            type_=provider.type,
            api_key=api_key,
            base_url=provider.base_url,
            models=provider.models,
            ssl_verify=provider.ssl_verify,
            timeout=provider.timeout,
            max_concurrent=provider.max_concurrent,
        )
        result.ai_providers_imported += 1

    async def _import_review(self, review: Review, strategy: str, result: ImportResult) -> None:
        """Import a single review."""
        existing = await self._review_repo.get_by_id(review.id)

        if existing is not None:
            if strategy == "skip":
                result.reviews_skipped += 1
                return
            if strategy == "replace":
                await self._review_repo.delete(review.id)

        # For reviews, we need to create them with the full structure
        await self._review_repo.create_from_source(
            host_id=review.host_id,
            repo_path=review.repo_path,
            source=review.source,
            brief_config=review.iterations[0].brief_config if review.iterations else None,
        )
        result.reviews_imported += 1
