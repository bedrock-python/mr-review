from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from mr_review.core.reviews.entities import BriefConfig, Comment, IterationStage
from mr_review.core.reviews.sources import ReviewSource


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


class CommentResponse(BaseModel):
    id: UUID
    file: str | None = None
    line: int | None = None
    severity: Literal["critical", "major", "minor", "suggestion"]
    body: str
    status: Literal["kept", "dismissed"] = "kept"
    resolved: bool = False


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


class UpdateCommentRequest(BaseModel):
    """Partial update of one comment; omitted fields keep their current value.

    ``file`` and ``line`` tell an omitted field apart from an explicit ``null``:
    ``"file": null`` clears the anchor (the comment becomes a general note, its line
    goes too), ``"line": null`` keeps the file but drops the line.
    """

    id: UUID
    status: Literal["kept", "dismissed"] | None = None
    body: str | None = None
    severity: Literal["critical", "major", "minor", "suggestion"] | None = None
    resolved: bool | None = None
    file: str | None = None
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

    def apply_to(self, comment: Comment) -> Comment:
        """Return ``comment`` with this patch applied.

        Raises ``ValueError`` when the result would carry a line without a file,
        e.g. a ``line`` patch on a general comment.
        """
        updates: dict[str, object] = {
            name: value
            for name in ("status", "body", "severity", "resolved")
            if (value := getattr(self, name)) is not None
        }
        touches_anchor = bool({"file", "line"} & self.model_fields_set)
        if "file" in self.model_fields_set:
            updates["file"] = self.file
            if self.file is None:
                updates["line"] = None
        if "line" in self.model_fields_set:
            updates["line"] = self.line
        updated = comment.model_copy(update=updates)
        if touches_anchor and updated.file is None and updated.line is not None:
            raise ValueError(f"Comment {comment.id} is a general comment; set file together with line")
        return updated


class UpdateReviewRequest(BaseModel):
    brief_config: BriefConfig | None = None
    iteration_id: UUID | None = None
    iteration_stage: IterationStage | None = None
    iteration_comments: list[UpdateCommentRequest] | None = None


class DispatchReviewRequest(BaseModel):
    ai_provider_id: UUID
    model: str | None = None
    temperature: float | None = None
    reasoning_budget: int | None = None
    reasoning_effort: Literal["low", "medium", "high"] | None = None
    iteration_id: UUID | None = None


class GetPromptRequest(BaseModel):
    brief_config: BriefConfig | None = None
    iteration_id: UUID | None = None


class PostReviewRequest(BaseModel):
    diff_refs: dict[str, str] = Field(default_factory=dict)
    iteration_id: UUID | None = None
    fallback_to_general_note: bool = True


class PostReviewResponse(BaseModel):
    posted: int


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
