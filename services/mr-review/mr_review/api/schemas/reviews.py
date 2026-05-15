from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from mr_review.core.reviews.entities import BriefConfig, ReviewStage


class CreateReviewRequest(BaseModel):
    host_id: UUID
    repo_path: str
    mr_iid: int
    brief_config: BriefConfig | None = None


class CommentResponse(BaseModel):
    id: UUID
    file: str | None = None
    line: int | None = None
    severity: Literal["critical", "major", "minor", "suggestion"]
    body: str
    status: Literal["kept", "dismissed"] = "kept"


class ReviewResponse(BaseModel):
    id: UUID
    host_id: UUID
    repo_path: str
    mr_iid: int
    stage: ReviewStage
    comments: list[CommentResponse] = Field(default_factory=list)
    brief_config: BriefConfig = Field(default_factory=BriefConfig)
    created_at: datetime
    updated_at: datetime


class UpdateCommentRequest(BaseModel):
    id: UUID
    status: Literal["kept", "dismissed"] | None = None
    body: str | None = None
    severity: Literal["critical", "major", "minor", "suggestion"] | None = None


class UpdateReviewRequest(BaseModel):
    stage: ReviewStage | None = None
    comments: list[UpdateCommentRequest] | None = None
    brief_config: BriefConfig | None = None


class DispatchReviewRequest(BaseModel):
    ai_provider_id: UUID
    model: str | None = None


class PostReviewRequest(BaseModel):
    diff_refs: dict[str, str] = Field(default_factory=dict)


class PostReviewResponse(BaseModel):
    posted: int


class ImportResponseRequest(BaseModel):
    raw: str


class CommentParseErrorResponse(BaseModel):
    index: int
    reason: str
    raw: str


class ImportResponseResponse(BaseModel):
    imported: int
    errors: list[CommentParseErrorResponse] = Field(default_factory=list)
    json_error: str | None = None
