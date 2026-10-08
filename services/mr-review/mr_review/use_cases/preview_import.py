"""Preview import use case."""

from __future__ import annotations

from uuid import UUID

from mr_review.core.ai_providers.repositories import AIProviderRepository
from mr_review.core.export_import.entities import ExportData, ImportPreview, ImportPreviewCounts
from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.review_presets.repositories import ReviewPresetRepository
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.use_cases.import_data import referenced_preset_ids


class PreviewImportUseCase:
    """Describe a package before importing it: what it holds and what already exists here.

    Reads only; needs no passphrase, since ids, names and counts are never encrypted.
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

    async def execute(self, data: ExportData) -> ImportPreview:
        host_ids = {host.id for host in await self._host_repo.list_all()}
        provider_ids = {provider.id for provider in await self._ai_provider_repo.list_all()}
        preset_ids = {preset.id for preset in await self._preset_repo.list_all()}
        review_ids = {review.id for review in await self._review_repo.list_all_uncapped()} if data.reviews else set()
        known_host_ids = host_ids | {host.id for host in data.hosts}
        known_preset_ids = preset_ids | {preset.id for preset in data.review_presets}
        return ImportPreview(
            version=data.version,
            exported_at=data.exported_at,
            encrypted=data.encrypted,
            secrets=data.secrets_mode,
            hosts=_counts([host.id for host in data.hosts], host_ids),
            ai_providers=_counts([provider.id for provider in data.ai_providers], provider_ids),
            review_presets=_counts([preset.id for preset in data.review_presets], preset_ids),
            reviews=_counts([review.id for review in data.reviews], review_ids),
            reviews_without_host=sum(review.host_id not in known_host_ids for review in data.reviews),
            reviews_without_preset=sum(
                not referenced_preset_ids(review) <= known_preset_ids for review in data.reviews
            ),
        )


def _counts(incoming: list[UUID], existing: set[UUID]) -> ImportPreviewCounts:
    return ImportPreviewCounts(total=len(incoming), existing=sum(record_id in existing for record_id in incoming))
