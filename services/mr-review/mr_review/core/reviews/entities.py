from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
from enum import Enum
from typing import Final, Literal
from uuid import UUID

from pydantic import BaseModel, Field, ValidationError, computed_field, field_validator, model_validator

from mr_review.core.reviews.severity import Severity
from mr_review.core.reviews.sources import BranchDiffSource, MRSource, ReviewSource

# Sized for a model with a ~200k-token context window at ~4 characters per token, leaving
# room for the answer.
DEFAULT_PROMPT_BUDGET_CHARS: Final = 600_000
MIN_PROMPT_BUDGET_CHARS: Final = 20_000
MAX_PROMPT_BUDGET_CHARS: Final = 4_000_000
MAX_COMMENTS_LIMIT: Final = 200
MAX_FOCUS_AREAS: Final = 30
MAX_FOCUS_AREA_CHARS: Final = 200
MAX_PATH_PATTERNS: Final = 100
MAX_OUTPUT_LANGUAGE_CHARS: Final = 64


class BriefPreset(str, Enum):
    thorough = "thorough"
    security = "security"
    style = "style"
    performance = "performance"


def _clean_lines(values: list[str]) -> list[str]:
    """Stripped, non-empty, first occurrence of each value, in order."""
    seen: set[str] = set()
    cleaned: list[str] = []
    for value in values:
        item = value.strip()
        if item and item not in seen:
            seen.add(item)
            cleaned.append(item)
    return cleaned


class BriefConfig(BaseModel):
    """What the model is asked and what goes into the prompt. Every field has a default, so a
    brief stored by an older version loads as it was meant, with the newer options at their
    defaults."""

    preset: BriefPreset = BriefPreset.thorough
    # A saved preset whose instructions replace the built-in ``preset``'s; ``preset`` is the
    # fallback when the saved one has no instructions or was deleted.
    custom_preset_id: UUID | None = None
    include_diff: bool = True
    include_description: bool = True
    include_context: bool = True
    include_full_files: bool = False
    include_test_context: bool = False
    include_related_code: bool = False
    include_commit_history: bool = False
    custom_instructions: str = ""
    context_files: list[str] = Field(default_factory=list)
    # Things the model must check explicitly, beyond what the preset asks for.
    focus_areas: list[str] = Field(default_factory=list)
    # Language for comment bodies; empty asks for nothing, so the model follows the code and the MR.
    output_language: str = ""
    # Comments below this severity are not asked for, and are dropped when the answer is stored.
    min_severity: Severity = "suggestion"
    # At most this many comments are asked for and stored, the most severe first; ``None`` = no cap.
    max_comments: int | None = Field(default=None, ge=1, le=MAX_COMMENTS_LIMIT)
    # Glob patterns over changed-file paths. Non-empty ``include_paths`` keeps only matching
    # files; ``exclude_paths`` (plus the built-in defaults while ``use_default_excludes``) drops
    # files from the diff sent to the model and from context gathering.
    include_paths: list[str] = Field(default_factory=list)
    exclude_paths: list[str] = Field(default_factory=list)
    use_default_excludes: bool = True
    # Number every added and context diff line with its new-file line, so comments anchor right.
    annotate_line_numbers: bool = True
    # From iteration 2 on, show the model what the previous iteration already reported.
    include_previous_comments: bool = True
    # Upper bound on the prompt's size; lower-priority material is cut first.
    prompt_budget_chars: int = Field(
        default=DEFAULT_PROMPT_BUDGET_CHARS, ge=MIN_PROMPT_BUDGET_CHARS, le=MAX_PROMPT_BUDGET_CHARS
    )

    @field_validator("context_files", "include_paths", "exclude_paths")
    @classmethod
    def _clean_paths(cls, value: list[str]) -> list[str]:
        cleaned = _clean_lines(value)
        if len(cleaned) > MAX_PATH_PATTERNS:
            raise ValueError(f"at most {MAX_PATH_PATTERNS} entries are allowed")
        return cleaned

    @field_validator("focus_areas")
    @classmethod
    def _clean_focus_areas(cls, value: list[str]) -> list[str]:
        cleaned = _clean_lines([" ".join(item.split()) for item in value])
        if len(cleaned) > MAX_FOCUS_AREAS:
            raise ValueError(f"at most {MAX_FOCUS_AREAS} focus areas are allowed")
        if any(len(item) > MAX_FOCUS_AREA_CHARS for item in cleaned):
            raise ValueError(f"a focus area must be at most {MAX_FOCUS_AREA_CHARS} characters")
        return cleaned

    @field_validator("output_language")
    @classmethod
    def _single_line_language(cls, value: str) -> str:
        language = " ".join(value.split())
        if len(language) > MAX_OUTPUT_LANGUAGE_CHARS:
            raise ValueError(f"must be at most {MAX_OUTPUT_LANGUAGE_CHARS} characters")
        return language


# Fields a saved preset may not carry: which preset is selected is the brief's own business.
_NOT_OVERRIDABLE: Final = frozenset({"custom_preset_id"})


def normalize_brief_overrides(data: Mapping[str, object], *, strict: bool) -> dict[str, object]:
    """A partial ``BriefConfig`` — the fields a saved preset sets when it is picked — validated.

    Values come back in their JSON form. ``strict`` raises ``ValueError`` on an unknown field or
    a bad value; otherwise those are dropped, so a preset written by another version still loads.
    """
    known = {key: value for key, value in data.items() if key in BriefConfig.model_fields}
    unknown = sorted((set(data) - set(known)) | (set(known) & _NOT_OVERRIDABLE))
    if unknown and strict:
        raise ValueError(f"Unknown or not overridable brief fields: {', '.join(unknown)}")
    fields = {key: value for key, value in known.items() if key not in _NOT_OVERRIDABLE}
    while True:
        try:
            config = BriefConfig.model_validate(fields)
        except ValidationError as exc:
            if strict:
                raise ValueError(f"Invalid brief fields: {exc}") from exc
            bad = {str(error["loc"][0]) for error in exc.errors() if error["loc"]}
            if not bad & set(fields):
                return {}
            fields = {key: value for key, value in fields.items() if key not in bad}
            continue
        dumped = config.model_dump(mode="json")
        return {key: dumped[key] for key in fields}


class Comment(BaseModel):
    id: UUID
    file: str | None = None
    line: int | None = None
    severity: Literal["critical", "major", "minor", "suggestion"]
    body: str
    status: Literal["kept", "dismissed"] = "kept"
    resolved: bool = False


class IterationStage(str, Enum):
    brief = "brief"
    dispatch = "dispatch"
    polish = "polish"
    post = "post"


class Iteration(BaseModel):
    id: UUID
    number: int
    stage: IterationStage = IterationStage.brief
    comments: list[Comment] = Field(default_factory=list)
    ai_provider_id: UUID | None = None
    model: str | None = None
    brief_config: BriefConfig = Field(default_factory=BriefConfig)
    created_at: datetime
    completed_at: datetime | None = None
    # The model's answer exactly as received (dispatched or imported), kept so it can be shown
    # and parsed again; API payloads leave it out to stay small.
    raw_response: str | None = None


class Review(BaseModel):
    id: UUID
    host_id: UUID
    repo_path: str
    # mr_iid is retained for backward-compatible YAML storage and APIs that
    # predate ReviewSource. For BranchDiffSource reviews it is 0.
    mr_iid: int = 0
    source: ReviewSource = Field(default_factory=lambda: MRSource(mr_iid=0))
    iterations: list[Iteration] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def _sync_mr_iid_with_source(self) -> Review:
        """Keep ``mr_iid`` and ``source`` consistent.

        Historical reviews persisted only ``mr_iid``; new reviews may set
        ``source`` directly. After construction we make sure both agree so
        downstream code can read either field without surprises.
        """
        if isinstance(self.source, MRSource):
            if self.source.mr_iid == 0 and self.mr_iid != 0:
                object.__setattr__(self, "source", MRSource(mr_iid=self.mr_iid))
            elif self.mr_iid != self.source.mr_iid:
                object.__setattr__(self, "mr_iid", self.source.mr_iid)
        return self

    @computed_field  # type: ignore[prop-decorator]
    @property
    def brief_config(self) -> BriefConfig:
        if self.iterations:
            return self.iterations[-1].brief_config
        return BriefConfig()


__all__ = [
    "DEFAULT_PROMPT_BUDGET_CHARS",
    "BranchDiffSource",
    "BriefConfig",
    "BriefPreset",
    "Comment",
    "Iteration",
    "IterationStage",
    "MRSource",
    "Review",
    "ReviewSource",
    "normalize_brief_overrides",
]
