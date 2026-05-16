from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, computed_field


class BriefPreset(str, Enum):
    thorough = "thorough"
    security = "security"
    style = "style"
    performance = "performance"


class BriefConfig(BaseModel):
    preset: BriefPreset = BriefPreset.thorough
    include_diff: bool = True
    include_description: bool = True
    include_context: bool = True
    include_full_files: bool = False
    include_test_context: bool = False
    include_related_code: bool = False
    include_commit_history: bool = False
    custom_instructions: str = ""
    context_files: list[str] = Field(default_factory=list)


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


class Review(BaseModel):
    id: UUID
    host_id: UUID
    repo_path: str
    mr_iid: int
    iterations: list[Iteration] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def brief_config(self) -> BriefConfig:
        if self.iterations:
            return self.iterations[-1].brief_config
        return BriefConfig()
