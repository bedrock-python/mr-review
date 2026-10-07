"""Source-aware fetch of the data needed to build a review prompt.

Reviews can be backed by either a merge request (``MRSource``) or an ad-hoc
branch/commit diff (``BranchDiffSource``). The rest of the use-case pipeline
(diff fetching, prompt building, context collection) only needs four things:

* the list of ``DiffFile`` objects under review
* a human-readable title
* a human-readable description
* a ref to anchor file/context lookups against (the change's head commit)

This module exposes a single :func:`resolve_source` helper that produces those
four values regardless of the underlying source, so individual use cases stay
source-agnostic.
"""

from __future__ import annotations

from dataclasses import dataclass

from mr_review.core.mrs.entities import DiffFile
from mr_review.core.reviews.entities import Review
from mr_review.core.reviews.sources import BranchDiffSource, MRSource
from mr_review.core.vcs.protocols import VCSProvider


@dataclass(frozen=True)
class ResolvedSource:
    diff_files: list[DiffFile]
    title: str
    description: str
    ref: str


async def resolve_source(review: Review, provider: VCSProvider) -> ResolvedSource:
    """Fetch the diff + display metadata for ``review`` from ``provider``."""
    source = review.source
    if isinstance(source, MRSource):
        mr = await provider.get_mr(repo_path=review.repo_path, mr_iid=source.mr_iid)
        diff_files = await provider.get_diff(repo_path=review.repo_path, mr_iid=source.mr_iid)
        return ResolvedSource(
            diff_files=diff_files,
            title=mr.title,
            description=mr.description,
            # The head commit is readable from the target repo even for fork MRs and deleted branches;
            # a same-named branch there may be a different branch, or gone.
            ref=mr.head_sha or mr.source_branch,
        )
    if isinstance(source, BranchDiffSource):
        diff_files = await provider.get_branch_diff(
            repo_path=review.repo_path,
            base_ref=source.base_ref,
            head_ref=source.head_ref,
        )
        title = source.title or f"{source.base_ref}...{source.head_ref}"
        description = f"Ad-hoc branch review: comparing `{source.head_ref}` against `{source.base_ref}`."
        return ResolvedSource(
            diff_files=diff_files,
            title=title,
            description=description,
            ref=source.head_ref,
        )
    raise TypeError(f"Unsupported review source kind: {type(source).__name__}")
