from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from mr_review.core.reviews.entities import BriefConfig, IterationStage


class CreateReviewRequest(BaseModel):
    host_id: UUID
    repo_path: str
    mr_iid: int
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
    iterations: list[IterationResponse]
    brief_config: BriefConfig
    created_at: datetime
    updated_at: datetime


class UpdateCommentRequest(BaseModel):
    id: UUID
    status: Literal["kept", "dismissed"] | None = None
    body: str | None = None
    severity: Literal["critical", "major", "minor", "suggestion"] | None = None
    resolved: bool | None = None


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
