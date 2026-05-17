from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field


class MRSource(BaseModel):
    """Review backed by a merge request / pull request on a VCS host."""

    kind: Literal["mr"] = "mr"
    mr_iid: int


class BranchDiffSource(BaseModel):
    """Review backed by an ad-hoc diff between two refs in the same repository.

    base_ref is the merge-base candidate (e.g. ``main``); head_ref is the branch
    or commit under review (e.g. ``feature/x``). Refs may be branch names, tags,
    or commit SHAs.
    """

    kind: Literal["branch_diff"] = "branch_diff"
    base_ref: str
    head_ref: str
    title: str = ""


ReviewSource = Annotated[
    MRSource | BranchDiffSource,
    Field(discriminator="kind"),
]
