from __future__ import annotations

from uuid import UUID

from mr_review.core.review_presets.entities import ReviewPresetNotFoundError
from mr_review.core.review_presets.repositories import ReviewPresetRepository


class DeleteReviewPresetUseCase:
    """Forget a saved preset. Briefs that point at it fall back to their built-in preset."""

    def __init__(self, repo: ReviewPresetRepository) -> None:
        self._repo = repo

    async def execute(self, preset_id: UUID) -> None:
        if not await self._repo.delete(preset_id):
            raise ReviewPresetNotFoundError(f"Review preset {preset_id} not found")
