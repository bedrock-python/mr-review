"""Unit tests for PostReviewUseCase and _post_one_comment helper."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx
import pytest
from mr_review.core.reviews.entities import Review, ReviewStage
from mr_review.use_cases.reviews.post_review import PostReviewUseCase, _post_one_comment

from tests.factories.entities import make_comment, make_host, make_review

pytestmark = pytest.mark.unit


# ── _post_one_comment ─────────────────────────────────────────────────────────


async def test__post_one_comment__with_file_and_line__calls_post_inline_comment() -> None:
    """Routes file+line comments through post_inline_comment."""
    provider = AsyncMock()
    comment = make_comment(file="src/foo.py", line=42, body="Needs fix")

    result = await _post_one_comment(provider, comment, "org/repo", 7, {"base_sha": "abc"})

    assert result is True
    provider.post_inline_comment.assert_awaited_once_with(
        repo_path="org/repo",
        mr_iid=7,
        diff_refs={"base_sha": "abc"},
        file="src/foo.py",
        line=42,
        body="Needs fix",
    )
    provider.post_general_note.assert_not_awaited()


async def test__post_one_comment__no_file__calls_post_general_note() -> None:
    """Routes comments without file/line through post_general_note."""
    provider = AsyncMock()
    comment = make_comment(file=None, line=None, body="Overall concern")

    result = await _post_one_comment(provider, comment, "org/repo", 3, {})

    assert result is True
    provider.post_general_note.assert_awaited_once_with(
        repo_path="org/repo",
        mr_iid=3,
        body="Overall concern",
    )
    provider.post_inline_comment.assert_not_awaited()


async def test__post_one_comment__inline_fails_with_http_error__falls_back_to_general_note() -> None:
    """Falls back to general note when inline comment returns HTTP error."""
    provider = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 422
    mock_response.text = "unprocessable"
    provider.post_inline_comment.side_effect = httpx.HTTPStatusError("422", request=MagicMock(), response=mock_response)
    comment = make_comment(file="src/bar.py", line=10, body="Bad code")

    result = await _post_one_comment(provider, comment, "org/repo", 1, {})

    assert result is True
    provider.post_general_note.assert_awaited_once()
    call_kwargs = provider.post_general_note.call_args.kwargs
    assert "src/bar.py:10" in call_kwargs["body"]
    assert "Bad code" in call_kwargs["body"]


async def test__post_one_comment__both_fail__returns_false() -> None:
    """Returns False when both inline and fallback general note fail."""
    provider = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "server error"
    provider.post_inline_comment.side_effect = httpx.HTTPStatusError("500", request=MagicMock(), response=mock_response)
    provider.post_general_note.side_effect = RuntimeError("network down")
    comment = make_comment(file="src/baz.py", line=5, body="Issue")

    result = await _post_one_comment(provider, comment, "org/repo", 2, {})

    assert result is False


# ── PostReviewUseCase.execute ─────────────────────────────────────────────────


async def test__post_review__review_not_found__raises_value_error() -> None:
    """Raises ValueError when review does not exist."""
    review_repo = AsyncMock()
    host_repo = AsyncMock()
    review_repo.get_by_id.return_value = None

    use_case = PostReviewUseCase(review_repo, host_repo)

    with pytest.raises(ValueError, match="not found"):
        await use_case.execute(uuid4())


async def test__post_review__host_not_found__raises_value_error() -> None:
    """Raises ValueError when the review's host does not exist."""
    review_repo = AsyncMock()
    host_repo = AsyncMock()
    review = make_review()
    review_repo.get_by_id.return_value = review
    host_repo.get_by_id.return_value = None

    use_case = PostReviewUseCase(review_repo, host_repo)

    with pytest.raises(ValueError, match="not found"):
        await use_case.execute(review.id)


async def test__post_review__no_kept_comments__returns_zero_without_posting() -> None:
    """Returns 0 immediately when no comments have status='kept'."""
    review_repo = AsyncMock()
    host_repo = AsyncMock()
    review = make_review(
        stage=ReviewStage.polish,
        comments=[
            make_comment(status="dismissed"),
            make_comment(status="dismissed"),
        ],
    )
    review_repo.get_by_id.return_value = review
    host_repo.get_by_id.return_value = make_host()

    use_case = PostReviewUseCase(review_repo, host_repo)
    posted = await use_case.execute(review.id)

    assert posted == 0
    review_repo.update.assert_not_awaited()


async def test__post_review__kept_comments__posts_and_advances_stage() -> None:
    """Posts kept comments and updates stage to post."""
    review_repo = AsyncMock()
    host_repo = AsyncMock()
    kept = make_comment(status="kept", file="src/a.py", line=1, body="A")
    dismissed = make_comment(status="dismissed", file="src/b.py", line=2, body="B")
    review = make_review(stage=ReviewStage.polish, comments=[kept, dismissed])
    host = make_host(type="gitlab")
    review_repo.get_by_id.return_value = review
    host_repo.get_by_id.return_value = host

    mock_provider = AsyncMock()

    with patch("mr_review.use_cases.reviews.post_review.create_vcs_provider", return_value=mock_provider):
        use_case = PostReviewUseCase(review_repo, host_repo)
        posted = await use_case.execute(review.id, diff_refs={"base_sha": "abc"})

    assert posted == 1
    mock_provider.post_inline_comment.assert_awaited_once()
    review_repo.update.assert_awaited_once()
    saved: Review = review_repo.update.call_args[0][0]
    assert saved.stage == ReviewStage.post


async def test__post_review__all_comments_fail__returns_zero_but_updates_stage() -> None:
    """Updates stage to post even when all individual comment postings fail."""
    review_repo = AsyncMock()
    host_repo = AsyncMock()
    comment = make_comment(status="kept", file="src/x.py", line=9, body="X")
    review = make_review(stage=ReviewStage.polish, comments=[comment])
    host = make_host(type="gitlab")
    review_repo.get_by_id.return_value = review
    host_repo.get_by_id.return_value = host

    mock_provider = AsyncMock()
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "error"
    mock_provider.post_inline_comment.side_effect = httpx.HTTPStatusError(
        "500", request=MagicMock(), response=mock_response
    )
    mock_provider.post_general_note.side_effect = RuntimeError("also failed")

    with patch("mr_review.use_cases.reviews.post_review.create_vcs_provider", return_value=mock_provider):
        use_case = PostReviewUseCase(review_repo, host_repo)
        posted = await use_case.execute(review.id)

    assert posted == 0
    review_repo.update.assert_awaited_once()
    saved: Review = review_repo.update.call_args[0][0]
    assert saved.stage == ReviewStage.post
