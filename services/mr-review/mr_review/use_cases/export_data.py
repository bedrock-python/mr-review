"""Export data use case."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import datetime, timezone

from pydantic import SecretStr

from mr_review.core.ai_providers.entities import AIProvider
from mr_review.core.ai_providers.repositories import AIProviderRepository
from mr_review.core.export_import.encryption import PackageCipher
from mr_review.core.export_import.entities import (
    PACKAGE_VERSION,
    EncryptionParams,
    ExportData,
    ExportRequest,
    PackagedAIProvider,
    PackagedHost,
)
from mr_review.core.hosts.entities import Host
from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.review_presets.repositories import ReviewPresetRepository
from mr_review.core.reviews.repositories import ReviewRepository


class ExportDataUseCase:
    """Export hosts, AI providers, review presets and reviews as one package.

    Secrets are encrypted under the request's password, included in plain text only when
    the request explicitly asks for it, and left out otherwise. Every review is exported,
    not just the page the history list shows.
    """

    def __init__(
        self,
        host_repo: HostRepository,
        ai_provider_repo: AIProviderRepository,
        review_repo: ReviewRepository,
        preset_repo: ReviewPresetRepository,
    ) -> None:
        self._host_repo = host_repo
        self._ai_provider_repo = ai_provider_repo
        self._review_repo = review_repo
        self._preset_repo = preset_repo

    async def execute(self, request: ExportRequest) -> ExportData:
        hosts = await self._host_repo.list_all() if request.include_hosts else []
        providers = await self._ai_provider_repo.list_all() if request.include_ai_providers else []
        presets = await self._preset_repo.list_all() if request.include_review_presets else []
        reviews = await self._review_repo.list_all_uncapped() if request.include_reviews else []

        # Key derivation is deliberately slow; keep it off the event loop.
        packaged_hosts, packaged_providers, encryption = await asyncio.to_thread(
            _package_secrets, request, hosts, providers
        )
        mode = request.secrets_mode
        return ExportData(
            version=PACKAGE_VERSION,
            exported_at=datetime.now(timezone.utc),
            encrypted=mode == "encrypted",
            secrets=mode,
            encryption=encryption,
            hosts=packaged_hosts,
            ai_providers=packaged_providers,
            review_presets=presets,
            reviews=reviews,
        )


_Sealer = Callable[[SecretStr], SecretStr | None]


def _secret_sealer(request: ExportRequest) -> tuple[_Sealer, EncryptionParams | None]:
    """How each secret goes into the package, and the encryption block to store with it."""
    seal: _Sealer
    encryption: EncryptionParams | None = None
    if request.encryption_password is not None:
        cipher, encryption = PackageCipher.create(request.encryption_password.get_secret_value())

        def seal(secret: SecretStr) -> SecretStr | None:
            return SecretStr(cipher.encrypt(secret.get_secret_value()))

    elif request.include_plain_secrets:

        def seal(secret: SecretStr) -> SecretStr | None:
            return secret

    else:
        return (lambda _secret: None), None

    def seal_present(secret: SecretStr) -> SecretStr | None:
        # A host or provider imported without its secret stores an empty one. Writing it
        # as absent keeps an import elsewhere from replacing a real secret with nothing.
        return seal(secret) if secret.get_secret_value() else None

    return seal_present, encryption


def _package_secrets(
    request: ExportRequest,
    hosts: list[Host],
    providers: list[AIProvider],
) -> tuple[list[PackagedHost], list[PackagedAIProvider], EncryptionParams | None]:
    seal, encryption = _secret_sealer(request)
    packaged_hosts = [
        PackagedHost.model_validate({**host.model_dump(exclude={"token"}), "token": seal(host.token)}) for host in hosts
    ]
    packaged_providers = [
        PackagedAIProvider.model_validate(
            {**provider.model_dump(exclude={"api_key"}), "api_key": seal(provider.api_key)}
        )
        for provider in providers
    ]
    return packaged_hosts, packaged_providers, encryption
