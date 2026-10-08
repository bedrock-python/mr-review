from __future__ import annotations

from uuid import UUID

from mr_review.core.review_presets.entities import ReviewPreset
from mr_review.core.review_presets.repositories import ReviewPresetRepository


class UpdateReviewPresetUseCase:
    def __init__(self, repo: ReviewPresetRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        preset_id: UUID,
        *,
        name: str | None = None,
        description: str | None = None,
        instructions: str | None = None,
        brief_config: dict[str, object] | None = None,
    ) -> ReviewPreset:
        """Change the given fields; ``None`` leaves a field as it is.

        Raises ``ReviewPresetNotFoundError`` or ``ReviewPresetNameTakenError``.
        """
        return await self._repo.update(
            preset_id,
            name=name,
            description=description,
            instructions=instructions,
            brief_config=brief_config,
        )
