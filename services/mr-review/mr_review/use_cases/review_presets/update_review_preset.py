from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from mr_review.core.review_presets.entities import ReviewPreset
from mr_review.core.review_presets.repositories import ReviewPresetRepository
from mr_review.use_cases.review_presets.create_review_preset import ensure_name_free
from mr_review.use_cases.review_presets.errors import ReviewPresetNotFoundError


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
        """Change the given fields; ``None`` leaves a field as it is."""
        current = await self._repo.get_by_id(preset_id)
        if current is None:
            raise ReviewPresetNotFoundError(f"Review preset {preset_id} not found")
        if name is not None and name.casefold() != current.name.casefold():
            await ensure_name_free(self._repo, name, except_id=preset_id)
        changes: dict[str, object] = {
            key: value
            for key, value in (
                ("name", name),
                ("description", description),
                ("instructions", instructions),
                ("brief_config", brief_config),
            )
            if value is not None
        }
        changes["updated_at"] = datetime.now(timezone.utc)
        updated = await self._repo.update(current.model_copy(update=changes))
        if updated is None:
            raise ReviewPresetNotFoundError(f"Review preset {preset_id} not found")
        return updated
