from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from mr_review.use_cases.reviews.get_review_context import GetReviewContextUseCase

from tests.factories.entities import make_host, make_review

pytestmark = pytest.mark.unit

_NOW = datetime.now(timezone.utc)


def _make_mr_stub(source_branch: str = "feature/x") -> MagicMock:
    mr = MagicMock()
    mr.source_branch = source_branch
    return mr


def _make_use_case(
    review_repo: AsyncMock,
    host_repo: AsyncMock,
    provider: AsyncMock,
) -> GetReviewContextUseCase:
    return GetReviewContextUseCase(
        review_repo=review_repo,
        host_repo=host_repo,
        vcs_factory=lambda _host: provider,
    )


async def test__get_review_context__review_not_found__raises_value_error() -> None:
    """ValueError when review does not exist."""
    review_repo = AsyncMock()
    review_repo.get_by_id.return_value = None
    host_repo = AsyncMock()
    provider = AsyncMock()
    use_case = _make_use_case(review_repo, host_repo, provider)
    missing_id = uuid4()

    with pytest.raises(ValueError, match=str(missing_id)):
        await use_case.execute(missing_id)


async def test__get_review_context__host_not_found__raises_value_error() -> None:
    """ValueError when the host referenced by the review does not exist."""
    review = make_review()
    review_repo = AsyncMock()
    review_repo.get_by_id.return_value = review
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = None
    provider = AsyncMock()
    use_case = _make_use_case(review_repo, host_repo, provider)

    with pytest.raises(ValueError, match=str(review.host_id)):
        await use_case.execute(review.id)


async def test__get_review_context__found_files__merged_into_one_text() -> None:
    """Every context file found is in the merged text under its path."""
    host = make_host()
    review = make_review(host_id=host.id)
    review_repo = AsyncMock()
    review_repo.get_by_id.return_value = review
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host

    provider = AsyncMock()
    provider.get_mr.return_value = _make_mr_stub()
    provider.get_file.side_effect = lambda _repo, path, _ref: "# Hello" if path == "README.md" else None
    provider.list_directory.return_value = []

    use_case = _make_use_case(review_repo, host_repo, provider)
    merged = await use_case.execute(review.id)

    assert merged == "### README.md\n\n# Hello"


async def test__get_review_context__large_files__returned_uncut() -> None:
    """The context endpoint returns files whole; the prompt budget decides what is cut."""
    host = make_host()
    review = make_review(host_id=host.id)
    review_repo = AsyncMock()
    review_repo.get_by_id.return_value = review
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host

    large_content = "x" * 300_000
    provider = AsyncMock()
    provider.get_mr.return_value = _make_mr_stub()
    provider.get_file.side_effect = lambda _repo, path, _ref: large_content if path == "README.md" else None
    provider.list_directory.return_value = []

    use_case = _make_use_case(review_repo, host_repo, provider)
    merged = await use_case.execute(review.id)

    assert large_content in merged


async def test__get_review_context__passes_source_branch_to_provider() -> None:
    """provider.get_mr is called with the review's repo_path and mr_iid."""
    host = make_host()
    review = make_review(host_id=host.id)
    review_repo = AsyncMock()
    review_repo.get_by_id.return_value = review
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host

    provider = AsyncMock()
    provider.get_mr.return_value = _make_mr_stub(source_branch="feat/branch")
    provider.get_file.return_value = None
    provider.list_directory.return_value = []

    use_case = _make_use_case(review_repo, host_repo, provider)
    await use_case.execute(review.id)

    provider.get_mr.assert_awaited_once_with(repo_path=review.repo_path, mr_iid=review.mr_iid)
