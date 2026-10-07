from __future__ import annotations

from uuid import UUID

from mr_review.core.review_presets.entities import ReviewPreset
from mr_review.core.review_presets.repositories import ReviewPresetRepository
from mr_review.use_cases.review_presets.errors import ReviewPresetNameTakenError


async def ensure_name_free(repo: ReviewPresetRepository, name: str, *, except_id: UUID | None = None) -> None:
    """Raise ``ReviewPresetNameTakenError`` when another preset is already called ``name``."""
    wanted = name.casefold()
    for preset in await repo.list_all():
        if preset.id != except_id and preset.name.casefold() == wanted:
            raise ReviewPresetNameTakenError(f"A review preset named {preset.name!r} already exists")


class CreateReviewPresetUseCase:
    def __init__(self, repo: ReviewPresetRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        name: str,
        description: str = "",
        instructions: str = "",
        brief_config: dict[str, object] | None = None,
    ) -> ReviewPreset:
        """``brief_config`` must already be normalised (see ``normalize_brief_overrides``)."""
        await ensure_name_free(self._repo, name)
        return await self._repo.create(
            name=name,
            description=description,
            instructions=instructions,
            brief_config=dict(brief_config or {}),
        )
