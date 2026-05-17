"""Export data use case."""

from __future__ import annotations

from mr_review.core.ai_providers.repositories import AIProviderRepository
from mr_review.core.export_import.entities import ExportData, ExportRequest
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
            ExportData containing all requested entities
        """
        export_data = ExportData(exported_at=now_utc())

        if request.include_hosts:
            export_data.hosts = await self._host_repo.list_all()

        if request.include_ai_providers:
            export_data.ai_providers = await self._ai_provider_repo.list_all()

        if request.include_reviews:
            export_data.reviews = await self._review_repo.list_all()

        return export_data
