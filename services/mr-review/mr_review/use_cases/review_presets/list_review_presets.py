from __future__ import annotations

from mr_review.core.review_presets.entities import ReviewPreset
from mr_review.core.review_presets.repositories import ReviewPresetRepository


class ListReviewPresetsUseCase:
    def __init__(self, repo: ReviewPresetRepository) -> None:
        self._repo = repo

    async def execute(self) -> list[ReviewPreset]:
        return await self._repo.list_all()
