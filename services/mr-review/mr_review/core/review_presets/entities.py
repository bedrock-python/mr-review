"""Review presets: the four built-in review intents and the ones users save themselves."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Final
from uuid import UUID

from pydantic import BaseModel, Field

from mr_review.core.reviews.entities import BriefPreset

MAX_PRESET_NAME_CHARS: Final = 80
MAX_PRESET_DESCRIPTION_CHARS: Final = 500
MAX_PRESET_INSTRUCTIONS_CHARS: Final = 20_000


@dataclass(frozen=True, slots=True)
class BuiltinPreset:
    key: BriefPreset
    name: str
    description: str
    instructions: str


BUILTIN_PRESETS: Final[dict[BriefPreset, BuiltinPreset]] = {
    BriefPreset.thorough: BuiltinPreset(
        key=BriefPreset.thorough,
        name="Thorough",
        description="Complete review, bugs, logic, naming",
        instructions=(
            "Perform a thorough code review. Identify bugs, logic errors, missing edge cases, "
            "code smells, naming issues, and opportunities to simplify."
        ),
    ),
    BriefPreset.security: BuiltinPreset(
        key=BriefPreset.security,
        name="Security",
        description="Injections, auth, crypto, exposure",
        instructions=(
            "Focus on security issues: injection vulnerabilities, authentication/authorization flaws, "
            "insecure defaults, sensitive data exposure, and cryptographic weaknesses."
        ),
    ),
    BriefPreset.style: BuiltinPreset(
        key=BriefPreset.style,
        name="Style",
        description="Naming, readability, conventions",
        instructions=(
            "Review for code style, readability, and consistency: naming conventions, code organisation, "
            "documentation, and adherence to idiomatic patterns for the language."
        ),
    ),
    BriefPreset.performance: BuiltinPreset(
        key=BriefPreset.performance,
        name="Performance",
        description="Complexity, queries, allocations",
        instructions=(
            "Focus on performance: algorithmic complexity, unnecessary allocations, N+1 queries, "
            "blocking operations, and opportunities to cache or batch."
        ),
    ),
}


class ReviewPresetNotFoundError(LookupError):
    """No saved review preset has the requested id."""


class ReviewPresetNameTakenError(ValueError):
    """Another saved review preset already has this name (compared case-insensitively)."""


class ReviewPreset(BaseModel):
    """A review intent saved by the user, offered in the Brief next to the built-in ones.

    ``instructions`` replace the built-in preset's text in the prompt (empty keeps the built-in
    one); ``brief_config`` is a partial ``BriefConfig`` the Brief applies when the preset is
    picked — see ``normalize_brief_overrides``.
    """

    id: UUID
    name: str
    description: str = ""
    instructions: str = ""
    brief_config: dict[str, object] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
