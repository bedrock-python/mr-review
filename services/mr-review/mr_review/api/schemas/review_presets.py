from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from mr_review.core.review_presets.entities import (
    MAX_PRESET_DESCRIPTION_CHARS,
    MAX_PRESET_INSTRUCTIONS_CHARS,
    MAX_PRESET_NAME_CHARS,
)
from mr_review.core.reviews.entities import BriefPreset, normalize_brief_overrides


def _clean_name(value: str) -> str:
    name = " ".join(value.split())
    if not name:
        raise ValueError("name must not be blank")
    return name


def _clean_overrides(value: dict[str, object]) -> dict[str, object]:
    return normalize_brief_overrides(value, strict=True)


class CreateReviewPresetRequest(BaseModel):
    name: str = Field(max_length=MAX_PRESET_NAME_CHARS)
    description: str = Field(default="", max_length=MAX_PRESET_DESCRIPTION_CHARS)
    # Empty keeps the built-in preset's instructions in the prompt.
    instructions: str = Field(default="", max_length=MAX_PRESET_INSTRUCTIONS_CHARS)
    # A partial BriefConfig applied when the preset is picked; unknown fields are a 422.
    brief_config: dict[str, object] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        return _clean_name(value)

    @field_validator("brief_config")
    @classmethod
    def _overrides(cls, value: dict[str, object]) -> dict[str, object]:
        return _clean_overrides(value)


class UpdateReviewPresetRequest(BaseModel):
    """Omitted fields keep their value; ``brief_config`` replaces the stored overrides as a whole."""

    name: str | None = Field(default=None, max_length=MAX_PRESET_NAME_CHARS)
    description: str | None = Field(default=None, max_length=MAX_PRESET_DESCRIPTION_CHARS)
    instructions: str | None = Field(default=None, max_length=MAX_PRESET_INSTRUCTIONS_CHARS)
    brief_config: dict[str, object] | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str | None) -> str | None:
        return None if value is None else _clean_name(value)

    @field_validator("brief_config")
    @classmethod
    def _overrides(cls, value: dict[str, object] | None) -> dict[str, object] | None:
        return None if value is None else _clean_overrides(value)


class ReviewPresetResponse(BaseModel):
    id: UUID
    name: str
    description: str
    instructions: str
    brief_config: dict[str, object]
    created_at: datetime
    updated_at: datetime


class BuiltinPresetResponse(BaseModel):
    id: BriefPreset
    name: str
    description: str
    instructions: str
