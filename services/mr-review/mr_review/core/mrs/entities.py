from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from mr_review.core.pagination import Page

# State filter accepted by MR listings. "all" means every state.
MRStateFilter = Literal["opened", "merged", "closed", "all"]

# Personal MR listings a host can answer natively ("open MRs I opened / that are
# assigned to me / where my review is requested").
PersonalMRScope = Literal["authored", "assigned", "review_requested"]

# Inbox scopes exposed by the API: the personal ones plus "all", which spans the
# user's repositories.
InboxScope = Literal["all", "authored", "assigned", "review_requested"]


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
    # None means the host did not report the figure in this view (list endpoints
    # usually don't); the single-MR view fills them when the host provides them.
    additions: int | None = None
    deletions: int | None = None
    file_count: int | None = None
    web_url: str = ""
    created_at: datetime
    updated_at: datetime
    # Commit the source branch points at. Context files are read at this commit: it exists in the
    # target repository even for fork MRs and after the source branch is deleted. Internal only.
    head_sha: str | None = None


class InboxMR(BaseModel):
    """MR with the path of the repository it belongs to."""

    mr: MR
    repo_path: str


class InboxMRPage(Page[InboxMR]):
    """A page of the inbox. ``truncated_repos``: repositories (scope ``all``) that had more open MRs
    than the page took from each; their MR list has the rest."""

    truncated_repos: list[str] = Field(default_factory=list)


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
