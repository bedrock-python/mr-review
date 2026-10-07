from __future__ import annotations

from typing import Protocol
from uuid import UUID

from mr_review.core.review_presets.entities import ReviewPreset


class ReviewPresetRepository(Protocol):
    async def create(
        self,
        name: str,
        description: str,
        instructions: str,
        brief_config: dict[str, object],
    ) -> ReviewPreset: ...

    async def get_by_id(self, preset_id: UUID) -> ReviewPreset | None: ...

    async def list_all(self) -> list[ReviewPreset]:
        """Every saved preset, oldest first."""
        ...

    async def update(self, preset: ReviewPreset) -> ReviewPreset | None:
        """Store ``preset`` over the one with its id; ``None`` when there is none."""
        ...

    async def delete(self, preset_id: UUID) -> bool: ...
