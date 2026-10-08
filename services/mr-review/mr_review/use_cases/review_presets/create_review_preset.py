from __future__ import annotations

from mr_review.core.review_presets.entities import ReviewPreset
from mr_review.core.review_presets.repositories import ReviewPresetRepository


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
        """``brief_config`` must already be normalised (see ``normalize_brief_overrides``).

        Raises ``ReviewPresetNameTakenError`` when another preset has the name, ignoring case.
        """
        return await self._repo.create(
            name=name,
            description=description,
            instructions=instructions,
            brief_config=dict(brief_config or {}),
        )
