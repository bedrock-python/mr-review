from __future__ import annotations

from uuid import UUID

from mr_review.core.review_presets.entities import ReviewPreset, ReviewPresetNotFoundError
from mr_review.core.review_presets.repositories import ReviewPresetRepository


class GetReviewPresetUseCase:
    def __init__(self, repo: ReviewPresetRepository) -> None:
        self._repo = repo

    async def execute(self, preset_id: UUID) -> ReviewPreset:
        preset = await self._repo.get_by_id(preset_id)
        if preset is None:
            raise ReviewPresetNotFoundError(f"Review preset {preset_id} not found")
        return preset
