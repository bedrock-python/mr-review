from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, computed_field, model_validator

from mr_review.core.reviews.sources import BranchDiffSource, MRSource, ReviewSource


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
    "BranchDiffSource",
    "BriefConfig",
    "BriefPreset",
    "Comment",
    "Iteration",
    "IterationStage",
    "MRSource",
    "Review",
    "ReviewSource",
]
