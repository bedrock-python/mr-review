"""Tests for the source resolver used by review use cases."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from mr_review.core.mrs.entities import MR, DiffFile
from mr_review.core.reviews.sources import BranchDiffSource
from mr_review.use_cases.reviews.source_resolver import resolve_source

from tests.factories.entities import make_review

pytestmark = pytest.mark.unit


def _make_mr(*, title: str = "MR title", description: str = "desc", source_branch: str = "feature/x") -> MR:
    return MR(
        iid=7,
        title=title,
        description=description,
        author="alice",
        source_branch=source_branch,
        target_branch="main",
        status="opened",
        draft=False,
        pipeline=None,
        additions=0,
        deletions=0,
        file_count=0,
        web_url="",
        created_at=__import__("datetime").datetime(2026, 1, 1, tzinfo=__import__("datetime").timezone.utc),
        updated_at=__import__("datetime").datetime(2026, 1, 1, tzinfo=__import__("datetime").timezone.utc),
    )


async def test__resolve_source__mr_source__calls_get_mr_and_get_diff() -> None:
    """MR-backed reviews resolve metadata from get_mr() and diff from get_diff()."""
    provider = AsyncMock()
    provider.get_mr.return_value = _make_mr(title="Fix bug", description="Body", source_branch="feature/x")
    diff = [DiffFile(path="src/a.py", additions=1, deletions=0, hunks=[])]
    provider.get_diff.return_value = diff
    review = make_review(mr_iid=7, repo_path="team/svc")

    resolved = await resolve_source(review, provider)

    provider.get_mr.assert_awaited_once_with(repo_path="team/svc", mr_iid=7)
    provider.get_diff.assert_awaited_once_with(repo_path="team/svc", mr_iid=7)
    provider.get_branch_diff.assert_not_called()
    assert resolved.diff_files == diff
    assert resolved.title == "Fix bug"
    assert resolved.description == "Body"
    assert resolved.ref == "feature/x"


async def test__resolve_source__branch_diff_source__calls_get_branch_diff() -> None:
    """Branch-diff reviews skip get_mr entirely and use get_branch_diff."""
    provider = AsyncMock()
    diff = [DiffFile(path="src/b.py", additions=2, deletions=1, hunks=[])]
    provider.get_branch_diff.return_value = diff
    source = BranchDiffSource(base_ref="main", head_ref="feature/y", title="Pre-MR")
    review = make_review(source=source, repo_path="team/svc")

    resolved = await resolve_source(review, provider)

    provider.get_branch_diff.assert_awaited_once_with(
        repo_path="team/svc", base_ref="main", head_ref="feature/y"
    )
    provider.get_mr.assert_not_called()
    provider.get_diff.assert_not_called()
    assert resolved.diff_files == diff
    assert resolved.title == "Pre-MR"
    assert resolved.ref == "feature/y"


async def test__resolve_source__branch_diff_without_title__synthesizes_title_from_refs() -> None:
    """Empty title falls back to a base...head label."""
    provider = AsyncMock()
    provider.get_branch_diff.return_value = []
    source = BranchDiffSource(base_ref="main", head_ref="feature/z", title="")
    review = make_review(source=source)

    resolved = await resolve_source(review, provider)

    assert resolved.title == "main...feature/z"
