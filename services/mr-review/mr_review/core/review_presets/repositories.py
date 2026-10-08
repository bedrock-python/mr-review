from __future__ import annotations

from collections.abc import Callable
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

    async def upsert_with(
        self, preset_id: UUID, change: Callable[[ReviewPreset | None], ReviewPreset | None]
    ) -> ReviewPreset | None:
        """Atomically apply ``change`` to the stored preset (``None`` when there is none) and
        store what it returns as-is, timestamps included.

        Returning ``None`` or the object it was given writes nothing. Raises
        ``ReviewPresetNameTakenError`` when the result's name belongs to another preset.
        """
        ...

    async def delete(self, preset_id: UUID) -> bool: ...
