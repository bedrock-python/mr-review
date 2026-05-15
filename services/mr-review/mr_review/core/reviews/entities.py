from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class BriefPreset(str, Enum):
    thorough = "thorough"
    security = "security"
    style = "style"
    performance = "performance"


class BriefConfig(BaseModel):
    preset: BriefPreset = BriefPreset.thorough
    include_diff: bool = True
    include_description: bool = True
    include_full_files: bool = False
    include_test_context: bool = False
    include_related_code: bool = False
    include_commit_history: bool = False
    custom_instructions: str = ""


class Comment(BaseModel):
    id: UUID
    file: str | None = None
    line: int | None = None
    severity: Literal["critical", "major", "minor", "suggestion"]
    body: str
    status: Literal["kept", "dismissed"] = "kept"


class ReviewStage(str, Enum):
    pick = "pick"
    brief = "brief"
    dispatch = "dispatch"
    polish = "polish"
    post = "post"


class Review(BaseModel):
    id: UUID
    host_id: UUID
    repo_path: str
    mr_iid: int
    stage: ReviewStage = ReviewStage.pick
    comments: list[Comment] = Field(default_factory=list)
    brief_config: BriefConfig = Field(default_factory=BriefConfig)
    created_at: datetime
    updated_at: datetime
