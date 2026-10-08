from __future__ import annotations

from typing import Protocol
from uuid import UUID

from mr_review.core.review_presets.entities import ReviewPreset


class ReviewPresetRepository(Protocol):
    """Saved review presets. Names are unique ignoring case; ``create`` and ``update`` check that
    and write in one step, so two concurrent requests cannot both take a name or lose a change."""

    async def create(
        self,
        name: str,
        description: str,
        instructions: str,
        brief_config: dict[str, object],
    ) -> ReviewPreset:
        """Raises ``ReviewPresetNameTakenError``."""
        ...

    async def get_by_id(self, preset_id: UUID) -> ReviewPreset | None: ...

    async def list_all(self) -> list[ReviewPreset]:
        """Every saved preset, oldest first."""
        ...

    async def update(
        self,
        preset_id: UUID,
        *,
        name: str | None = None,
        description: str | None = None,
        instructions: str | None = None,
        brief_config: dict[str, object] | None = None,
    ) -> ReviewPreset:
        """Change the given fields of the stored preset; ``None`` leaves a field as it is.

        Raises ``ReviewPresetNotFoundError`` or ``ReviewPresetNameTakenError``.
        """
        ...

    async def delete(self, preset_id: UUID) -> bool: ...
