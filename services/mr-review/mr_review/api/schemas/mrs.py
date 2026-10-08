from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class PageResponse[T](BaseModel):
    """Envelope shared by every paginated listing. ``page`` is 1-based.

    ``has_more`` follows the host's own next-page signal, so a page can be short — even
    empty — while more pages remain.
    """

    items: list[T]
    page: int
    per_page: int
    has_more: bool


class RepoResponse(BaseModel):
    id: str
    path: str
    name: str
    description: str | None = None


class MRResponse(BaseModel):
    iid: int
    title: str
    description: str
    author: str
    source_branch: str
    target_branch: str
    status: Literal["opened", "merged", "closed"]
    draft: bool
    pipeline: Literal["passed", "failed", "running", "none"] | None = None
    # null: the host didn't report the figure in this view (e.g. GitHub PR lists).
    additions: int | None = None
    deletions: int | None = None
    file_count: int | None = None
    web_url: str = ""
    created_at: datetime
    updated_at: datetime


class InboxMRResponse(BaseModel):
    repo_path: str
    iid: int
    title: str
    description: str
    author: str
    source_branch: str
    target_branch: str
    status: Literal["opened", "merged", "closed"]
    draft: bool
    pipeline: Literal["passed", "failed", "running", "none"] | None = None
    # null: the host didn't report the figure in this view (e.g. GitHub PR lists).
    additions: int | None = None
    deletions: int | None = None
    file_count: int | None = None
    web_url: str = ""
    created_at: datetime
    updated_at: datetime


class DiffLineResponse(BaseModel):
    type: Literal["context", "added", "removed"]
    old_line: int | None = None
    new_line: int | None = None
    content: str


class DiffHunkResponse(BaseModel):
    old_start: int
    new_start: int
    old_count: int
    new_count: int
    lines: list[DiffLineResponse]


class DiffFileResponse(BaseModel):
    path: str
    old_path: str | None = None
    additions: int
    deletions: int
    hunks: list[DiffHunkResponse]


class RepoPageResponse(PageResponse[RepoResponse]):
    pass


class MRPageResponse(PageResponse[MRResponse]):
    pass


class InboxMRPageResponse(PageResponse[InboxMRResponse]):
    # scope=all takes only the newest few open MRs of each repository; these had more.
    truncated_repos: list[str] = Field(default_factory=list)
