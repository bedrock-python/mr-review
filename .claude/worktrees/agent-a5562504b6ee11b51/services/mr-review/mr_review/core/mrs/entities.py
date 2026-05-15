from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class Repo(BaseModel):
    id: str
    path: str
    name: str
    description: str | None = None


class MR(BaseModel):
    iid: int
    title: str
    description: str
    author: str
    source_branch: str
    target_branch: str
    status: Literal["opened", "merged", "closed"]
    draft: bool
    pipeline: Literal["passed", "failed", "running", "none"] | None = None
    additions: int
    deletions: int
    file_count: int
    created_at: datetime
    updated_at: datetime


class DiffLine(BaseModel):
    type: Literal["context", "added", "removed"]
    old_line: int | None = None
    new_line: int | None = None
    content: str


class DiffHunk(BaseModel):
    old_start: int
    new_start: int
    old_count: int
    new_count: int
    lines: list[DiffLine]


class DiffFile(BaseModel):
    path: str
    old_path: str | None = None
    additions: int
    deletions: int
    hunks: list[DiffHunk]
