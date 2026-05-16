from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import httpx
import pytest
from mr_review.infra.vcs.cache import VCSCache
from mr_review.use_cases.reviews.context_files import CONTEXT_EMBED_CHARS
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
    vcs_cache = MagicMock(spec=VCSCache)
    vcs_cache.get_or_create.return_value = provider
    vcs_client = MagicMock(spec=httpx.AsyncClient)
    return GetReviewContextUseCase(
        review_repo=review_repo,
        host_repo=host_repo,
        vcs_cache=vcs_cache,
        vcs_client=vcs_client,
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


async def test__get_review_context__small_context__returns_merged_and_is_large_false() -> None:
    """Returns (merged_context, False) when total chars < CONTEXT_EMBED_CHARS."""
    host = make_host()
    review = make_review(host_id=host.id)
    review_repo = AsyncMock()
    review_repo.get_by_id.return_value = review
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host

    provider = AsyncMock()
    provider.get_mr.return_value = _make_mr_stub()
    provider.get_file.return_value = "# Hello"
    provider.list_directory.return_value = []

    use_case = _make_use_case(review_repo, host_repo, provider)
    merged, is_large = await use_case.execute(review.id)

    assert is_large is False
    assert isinstance(merged, str)


async def test__get_review_context__large_context__returns_is_large_true() -> None:
    """Returns (merged_context, True) when total chars >= CONTEXT_EMBED_CHARS."""
    host = make_host()
    review = make_review(host_id=host.id)
    review_repo = AsyncMock()
    review_repo.get_by_id.return_value = review
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host

    large_content = "x" * CONTEXT_EMBED_CHARS
    provider = AsyncMock()
    provider.get_mr.return_value = _make_mr_stub()
    provider.get_file.return_value = large_content
    provider.list_directory.return_value = []

    use_case = _make_use_case(review_repo, host_repo, provider)
    merged, is_large = await use_case.execute(review.id)

    assert is_large is True


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
