"""Tests for CreateCodeReviewUseCase."""

from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from mr_review.core.reviews.sources import BranchDiffSource
from mr_review.use_cases.reviews.create_code_review import CreateCodeReviewUseCase

from tests.factories.entities import make_review

pytestmark = pytest.mark.unit


async def test__create_code_review__valid_params__delegates_to_create_from_source() -> None:
    """CreateCodeReviewUseCase forwards refs to the repo as a BranchDiffSource."""
    repo = AsyncMock()
    host_id = uuid4()
    expected = make_review(host_id=host_id, source=BranchDiffSource(base_ref="main", head_ref="feat/x"))
    repo.create_from_source.return_value = expected
    use_case = CreateCodeReviewUseCase(repo)

    result = await use_case.execute(
        host_id=host_id,
        repo_path="team/service",
        base_ref="main",
        head_ref="feat/x",
        title="My branch review",
    )

    repo.create_from_source.assert_awaited_once()
    call_kwargs = repo.create_from_source.call_args.kwargs
    assert call_kwargs["host_id"] == host_id
    assert call_kwargs["repo_path"] == "team/service"
    passed_source = call_kwargs["source"]
    assert isinstance(passed_source, BranchDiffSource)
    assert passed_source.base_ref == "main"
    assert passed_source.head_ref == "feat/x"
    assert passed_source.title == "My branch review"
    assert result == expected


async def test__create_code_review__empty_title__defaults_to_empty_string() -> None:
    """Title is optional; the use case omits it cleanly when not supplied."""
    repo = AsyncMock()
    expected = make_review(source=BranchDiffSource(base_ref="main", head_ref="feat/x"))
    repo.create_from_source.return_value = expected
    use_case = CreateCodeReviewUseCase(repo)

    await use_case.execute(host_id=uuid4(), repo_path="ns/repo", base_ref="main", head_ref="feat/x")

    passed_source = repo.create_from_source.call_args.kwargs["source"]
    assert passed_source.title == ""
