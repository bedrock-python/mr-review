"""Export data use case."""

from __future__ import annotations

from pydantic import SecretStr

from mr_review.core.ai_providers.entities import AIProvider
from mr_review.core.ai_providers.repositories import AIProviderRepository
from mr_review.core.export_import.encryption import encrypt_token
from mr_review.core.export_import.entities import ExportData, ExportRequest
from mr_review.core.hosts.entities import Host
from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.infra.utils import now_utc


class ExportDataUseCase:
    """Export selected data (hosts, AI providers, reviews) to a single package."""

    def __init__(
        self,
        host_repo: HostRepository,
        ai_provider_repo: AIProviderRepository,
        review_repo: ReviewRepository,
    ) -> None:
        self._host_repo = host_repo
        self._ai_provider_repo = ai_provider_repo
        self._review_repo = review_repo

    async def execute(self, request: ExportRequest) -> ExportData:
        """Export data based on the request filters.

        Args:
            request: Export request specifying what to include

        Returns:
            ExportData containing all requested entities with optionally encrypted tokens
        """
        export_data = ExportData(
            exported_at=now_utc(),
            encrypted=request.encryption_password is not None,
        )

        if request.include_hosts:
            hosts = await self._host_repo.list_all()
            if request.encryption_password:
                export_data.hosts = [self._encrypt_host_token(h, request.encryption_password) for h in hosts]
            else:
                # Get plain tokens using get_secret_value()
                export_data.hosts = [self._expose_host_token(h) for h in hosts]

        if request.include_ai_providers:
            providers = await self._ai_provider_repo.list_all()
            if request.encryption_password:
                export_data.ai_providers = [
                    self._encrypt_provider_token(p, request.encryption_password) for p in providers
                ]
            else:
                export_data.ai_providers = [self._expose_provider_token(p) for p in providers]

        if request.include_reviews:
            export_data.reviews = await self._review_repo.list_all()

        return export_data

    def _expose_host_token(self, host: Host) -> Host:
        """Return host as-is. Tokens will be exposed during serialization."""
        return host

    def _encrypt_host_token(self, host: Host, password: str) -> Host:
        """Return host with encrypted token."""
        plain_token = host.token.get_secret_value()
        encrypted_token = encrypt_token(plain_token, password)
        return host.model_copy(update={"token": SecretStr(encrypted_token)})

    def _expose_provider_token(self, provider: AIProvider) -> AIProvider:
        """Return provider as-is. API keys will be exposed during serialization."""
        return provider

    def _encrypt_provider_token(self, provider: AIProvider, password: str) -> AIProvider:
        """Return provider with encrypted API key."""
        plain_key = provider.api_key.get_secret_value()
        encrypted_key = encrypt_token(plain_key, password)
        return provider.model_copy(update={"api_key": SecretStr(encrypted_key)})
