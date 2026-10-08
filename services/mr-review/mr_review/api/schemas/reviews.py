from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from mr_review.core.ai.entities import DispatchOptions, ReasoningEffort
from mr_review.core.reviews.entities import BriefConfig, IterationStage, PostOutcome
from mr_review.core.reviews.sources import ReviewSource
from mr_review.core.vcs.entities import PostFailureKind
from mr_review.use_cases.reviews.dto import CommentPatchDTO
from mr_review.use_cases.reviews.post_body import SeverityLabel


class CreateReviewRequest(BaseModel):
    host_id: UUID
    repo_path: str
    mr_iid: int
    brief_config: BriefConfig | None = None


class CreateCodeReviewRequest(BaseModel):
    host_id: UUID
    repo_path: str
    base_ref: str
    head_ref: str
    title: str = ""
    brief_config: BriefConfig | None = None


class CreateIterationRequest(BaseModel):
    brief_config: BriefConfig | None = None


class CommentPostResponse(BaseModel):
    """What happened the last time the comment was sent to the MR."""

    outcome: PostOutcome
    at: datetime
    note_id: str | None = None
    url: str | None = None
    reason: str | None = None
    # failed only: position_rejected, rejected, ambiguous (may be on the MR after all) or blocked.
    failure_kind: PostFailureKind | None = None


class CommentResponse(BaseModel):
    id: UUID
    file: str | None = None
    line: int | None = None
    severity: Literal["critical", "major", "minor", "suggestion"]
    body: str
    status: Literal["kept", "dismissed"] = "kept"
    resolved: bool = False
    post: CommentPostResponse | None = None


class IterationResponse(BaseModel):
    id: UUID
    number: int
    stage: IterationStage
    comments: list[CommentResponse]
    ai_provider_id: UUID | None
    model: str | None
    brief_config: BriefConfig
    created_at: datetime
    completed_at: datetime | None


class ReviewResponse(BaseModel):
    id: UUID
    host_id: UUID
    repo_path: str
    mr_iid: int
    source: ReviewSource
    iterations: list[IterationResponse]
    brief_config: BriefConfig
    created_at: datetime
    updated_at: datetime


def _reject_blank(value: str | None, field: str) -> str | None:
    if value is not None and not value.strip():
        raise ValueError(f"{field} must not be blank")
    return value


class UpdateCommentRequest(CommentPatchDTO):
    """Partial update of one comment; omitted fields keep their current value.

    ``file`` and ``line`` tell an omitted field apart from an explicit ``null``:
    ``"file": null`` clears the anchor (the comment becomes a general note, its line
    goes too), ``"line": null`` keeps the file but drops the line.
    """

    line: int | None = Field(default=None, ge=1)

    @field_validator("body")
    @classmethod
    def _body_not_blank(cls, value: str | None) -> str | None:
        return _reject_blank(value, "body")

    @field_validator("file")
    @classmethod
    def _file_not_blank(cls, value: str | None) -> str | None:
        return _reject_blank(value, "file")

    @model_validator(mode="after")
    def _line_needs_file(self) -> UpdateCommentRequest:
        if "file" in self.model_fields_set and self.file is None and self.line is not None:
            raise ValueError("line cannot be set when file is null")
        return self


class UpdateReviewRequest(BaseModel):
    brief_config: BriefConfig | None = None
    iteration_id: UUID | None = None
    iteration_stage: IterationStage | None = None
    iteration_comments: list[UpdateCommentRequest] | None = None


class DispatchReviewRequest(BaseModel):
    """Which provider and model to run, and how. ``null`` everywhere means the default.

    Settings the chosen model does not accept are dropped or adapted rather than sent — see
    ``GET /ai-providers/{id}/capabilities`` for what a model takes.
    """

    ai_provider_id: UUID
    model: str | None = Field(default=None, description="null: the provider's first model.")
    temperature: float | None = Field(
        default=None,
        ge=0,
        le=2,
        description="Sent only to models that take it, only while reasoning is off; Claude caps it at 1.",
    )
    reasoning_budget: int | None = Field(
        default=None, ge=1, le=128_000, description="Thinking tokens, for models with budget-based reasoning."
    )
    reasoning_effort: ReasoningEffort | None = Field(
        default=None, description="Reasoning depth; the nearest level the model has is used."
    )
    max_output_tokens: int | None = Field(
        default=None,
        ge=256,
        le=128_000,
        description="Output limit, thinking included; capped at the model's maximum. null: 32k for Claude "
        "(64k at xhigh/max effort), the endpoint's own default otherwise.",
    )
    structured_output: bool | None = Field(
        default=None,
        description="Constrain the answer to the review JSON schema. null: on for claude and openai models "
        "known to support it, off for openai_compat.",
    )
    system_prompt: str | None = Field(
        default=None, max_length=20_000, description="Replaces the built-in system prompt; null or blank keeps it."
    )
    iteration_id: UUID | None = None

    @field_validator("model", "system_prompt")
    @classmethod
    def _blank_is_default(cls, value: str | None) -> str | None:
        return value if value is None or value.strip() else None

    def to_options(self) -> DispatchOptions:
        return DispatchOptions(
            model=self.model.strip() if self.model else None,
            temperature=self.temperature,
            reasoning_effort=self.reasoning_effort,
            reasoning_budget=self.reasoning_budget,
            max_output_tokens=self.max_output_tokens,
            structured_output=self.structured_output,
            system_prompt=self.system_prompt,
        )


class DispatchCommentEvent(BaseModel):
    """``event: comment`` — a comment that just completed in the stream (a preview, without an id)."""

    index: int
    file: str | None
    line: int | None
    severity: Literal["critical", "major", "minor", "suggestion"]
    body: str


class DispatchDoneEvent(BaseModel):
    """``event: done`` — sent once, after the iteration has been written.

    ``comments`` counts what the iteration holds now. ``kept_previous`` is true when the answer
    was not used — unreadable, cut off or empty — and the iteration kept its comments and stage.
    """

    iteration_id: UUID
    comments: int
    errors: int
    json_error: str | None
    truncated: bool
    kept_previous: bool
    # Parsed comments dropped by the brief's minimum severity or comment cap (not in ``comments``).
    filtered: int = 0


class DispatchErrorEvent(BaseModel):
    """``event: error`` — the stream ends after it, without ``done``.

    The iteration keeps its comments; one that had none takes the complete comments that arrived.
    """

    message: str


class GetPromptRequest(BaseModel):
    brief_config: BriefConfig | None = None
    iteration_id: UUID | None = None


class PromptSectionResponse(BaseModel):
    """One part of the prompt: how much of it went in and what the budget cut or left out."""

    key: Literal[
        "instructions",
        "diff",
        "description",
        "previous_comments",
        "context_files",
        "full_files",
        "test_files",
        "related_code",
        "commit_history",
    ]
    label: str
    # Characters this part takes in the prompt, and what it would have taken uncut.
    chars: int
    source_chars: int
    # Files (or comments) in this part, and how many of them are in the prompt.
    items: int
    included: int
    truncated: list[str]
    omitted: list[str]
    # Files skipped because their content looks binary.
    skipped: list[str]


class ExcludedFileResponse(BaseModel):
    path: str
    # The exclude pattern that matched, or "(not matched by the include patterns)".
    reason: str


class PromptPreviewResponse(BaseModel):
    prompt: str
    total_chars: int
    # A rough guide: about four characters per token.
    estimated_tokens: int
    budget_chars: int
    sections: list[PromptSectionResponse]
    files_total: int
    excluded_files: list[ExcludedFileResponse]
    # The saved preset whose instructions the prompt uses; ``preset_missing`` when the brief names
    # one that no longer exists and the built-in preset stood in.
    preset_name: str | None
    preset_missing: bool


class ExcludedFilesRequest(BaseModel):
    brief_config: BriefConfig | None = None


class ExcludedFilesResponse(BaseModel):
    total: int
    excluded: list[ExcludedFileResponse]


class PostReviewRequest(BaseModel):
    diff_refs: dict[str, str] = Field(default_factory=dict)
    iteration_id: UUID | None = None
    # Post a comment whose line cannot be anchored as a general note instead of failing it.
    fallback_to_general_note: bool = True
    # How the severity heads each posted comment: "**Major** · …", "[major] …", or not at all.
    severity_label: SeverityLabel = "bold"
    # Post every kept comment again, even those already on the MR; required once the iteration is
    # completed (the endpoint answers 409 otherwise).
    force: bool = False
    # Also send again the comments whose last attempt was ambiguous (the host did not answer
    # definitively, so they may be on the MR already).
    resend_ambiguous: bool = False


class CommentPostResultResponse(BaseModel):
    comment_id: UUID
    post: CommentPostResponse


class PostReviewResponse(BaseModel):
    # Comments this call put on the MR (inline or as general notes) and the ones it could not.
    posted: int
    failed: int
    # Kept comments already on the MR from an earlier post, not sent again.
    skipped: int
    # Kept comments whose last attempt was ambiguous, not sent again without resend_ambiguous.
    held_back: int = 0
    # Every kept comment is on the MR and the iteration is completed.
    completed: bool
    # One entry per comment this call sent, in the order they went out.
    results: list[CommentPostResultResponse] = Field(default_factory=list)
    review: ReviewResponse


class ImportResponseRequest(BaseModel):
    raw: str
    iteration_id: UUID | None = None


class CommentParseErrorResponse(BaseModel):
    index: int
    reason: str
    raw: str


class ImportResponseResponse(BaseModel):
    imported: int
    errors: list[CommentParseErrorResponse] = Field(default_factory=list)
    json_error: str | None = None
    # The answer stops mid-JSON (the model most likely hit its token limit); complete comments were kept.
    truncated: bool = False
    # Parsed comments dropped by the brief's minimum severity or comment cap (not in ``imported``).
    filtered: int = 0


class CreateCommentRequest(BaseModel):
    """A hand-written comment; without ``file`` it is a general (unanchored) note."""

    file: str | None = None
    line: int | None = Field(default=None, ge=1)
    severity: Literal["critical", "major", "minor", "suggestion"]
    body: str

    @field_validator("body")
    @classmethod
    def _body_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("body must not be blank")
        return value

    @field_validator("file")
    @classmethod
    def _file_not_blank(cls, value: str | None) -> str | None:
        return _reject_blank(value, "file")

    @model_validator(mode="after")
    def _line_needs_file(self) -> CreateCommentRequest:
        if self.file is None and self.line is not None:
            raise ValueError("line cannot be set without file")
        return self
