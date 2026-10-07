from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from mr_review.core.reviews.entities import IterationStage, Review
from mr_review.use_cases.reviews.create_comment import CreateCommentUseCase
from mr_review.use_cases.reviews.delete_comment import DeleteCommentUseCase
from mr_review.use_cases.reviews.iteration_comments import IterationLockedError

from tests.factories.entities import make_comment, make_iteration, make_review

pytestmark = pytest.mark.unit


def _echo_repo(review: Review) -> AsyncMock:
    """Repository double that returns ``review`` and persists whatever it is given."""
    repo = AsyncMock()
    repo.get_by_id.return_value = review
    repo.update.side_effect = lambda updated: updated
    return repo


async def test__create_comment__anchored__appends_comment_with_server_id() -> None:
    """CreateCommentUseCase appends a kept comment with a fresh id after the existing ones."""
    existing = make_comment(body="from the model")
    iteration = make_iteration(stage=IterationStage.polish, comments=[existing])
    review = make_review(iterations=[iteration])
    repo = _echo_repo(review)

    result = await CreateCommentUseCase(repo).execute(
        review_id=review.id,
        iteration_id=iteration.id,
        severity="major",
        body="Handle the empty list",
        file="src/app.py",
        line=12,
    )

    comments = result.iterations[0].comments
    assert [c.body for c in comments] == ["from the model", "Handle the empty list"]
    added = comments[1]
    assert added.id != existing.id
    assert (added.file, added.line, added.severity, added.status) == ("src/app.py", 12, "major", "kept")
    repo.update.assert_awaited_once()


async def test__create_comment__line_without_file__stores_general_comment() -> None:
    """A line passed without a file is dropped: the comment is a general note."""
    iteration = make_iteration(stage=IterationStage.polish, comments=[])
    review = make_review(iterations=[iteration])

    result = await CreateCommentUseCase(_echo_repo(review)).execute(
        review_id=review.id, iteration_id=iteration.id, severity="minor", body="Overall fine", line=4
    )

    added = result.iterations[0].comments[0]
    assert (added.file, added.line) == (None, None)


async def test__create_comment__only_target_iteration_changes() -> None:
    """Comments land on the requested iteration, not on the latest one."""
    first = make_iteration(number=1, stage=IterationStage.polish, comments=[])
    second = make_iteration(number=2, stage=IterationStage.polish, comments=[])
    review = make_review(iterations=[first, second])

    result = await CreateCommentUseCase(_echo_repo(review)).execute(
        review_id=review.id, iteration_id=first.id, severity="minor", body="Note"
    )

    assert len(result.iterations[0].comments) == 1
    assert result.iterations[1].comments == []


async def test__create_comment__review_missing__raises_value_error() -> None:
    """An unknown review id raises ValueError (mapped to 404)."""
    repo = AsyncMock()
    repo.get_by_id.return_value = None
    missing = uuid4()

    with pytest.raises(ValueError, match=str(missing)):
        await CreateCommentUseCase(repo).execute(review_id=missing, iteration_id=uuid4(), severity="minor", body="x")


async def test__create_comment__iteration_missing__raises_value_error() -> None:
    """An iteration id that is not on the review raises ValueError (mapped to 404)."""
    review = make_review()
    missing = uuid4()

    with pytest.raises(ValueError, match=str(missing)):
        await CreateCommentUseCase(_echo_repo(review)).execute(
            review_id=review.id, iteration_id=missing, severity="minor", body="x"
        )


@pytest.mark.parametrize(
    ("stage", "completed_at"),
    [
        (IterationStage.post, None),
        (IterationStage.polish, datetime(2026, 1, 1, tzinfo=timezone.utc)),
    ],
)
async def test__create_comment__posted_iteration__raises_locked(
    stage: IterationStage, completed_at: datetime | None
) -> None:
    """A posted or completed iteration refuses new comments and nothing is persisted."""
    iteration = make_iteration(stage=stage, completed_at=completed_at, comments=[])
    review = make_review(iterations=[iteration])
    repo = _echo_repo(review)

    with pytest.raises(IterationLockedError):
        await CreateCommentUseCase(repo).execute(
            review_id=review.id, iteration_id=iteration.id, severity="minor", body="x"
        )
    repo.update.assert_not_awaited()


async def test__delete_comment__existing__removes_only_that_comment() -> None:
    """DeleteCommentUseCase drops the comment and keeps the rest in order."""
    keep_a, target, keep_b = make_comment(body="a"), make_comment(body="target"), make_comment(body="b")
    iteration = make_iteration(stage=IterationStage.polish, comments=[keep_a, target, keep_b])
    review = make_review(iterations=[iteration])
    repo = _echo_repo(review)

    result = await DeleteCommentUseCase(repo).execute(
        review_id=review.id, iteration_id=iteration.id, comment_id=target.id
    )

    assert [c.body for c in result.iterations[0].comments] == ["a", "b"]
    repo.update.assert_awaited_once()


async def test__delete_comment__comment_missing__raises_value_error() -> None:
    """Deleting an unknown comment raises ValueError (mapped to 404) without persisting."""
    iteration = make_iteration(stage=IterationStage.polish, comments=[make_comment()])
    review = make_review(iterations=[iteration])
    repo = _echo_repo(review)
    missing = uuid4()

    with pytest.raises(ValueError, match=str(missing)):
        await DeleteCommentUseCase(repo).execute(review_id=review.id, iteration_id=iteration.id, comment_id=missing)
    repo.update.assert_not_awaited()


async def test__delete_comment__review_missing__raises_value_error() -> None:
    """An unknown review id raises ValueError (mapped to 404)."""
    repo = AsyncMock()
    repo.get_by_id.return_value = None

    with pytest.raises(ValueError, match="not found"):
        await DeleteCommentUseCase(repo).execute(review_id=uuid4(), iteration_id=uuid4(), comment_id=uuid4())


async def test__delete_comment__posted_iteration__raises_locked() -> None:
    """A posted iteration keeps its comments."""
    comment = make_comment()
    iteration = make_iteration(
        stage=IterationStage.post, completed_at=datetime(2026, 1, 1, tzinfo=timezone.utc), comments=[comment]
    )
    review = make_review(iterations=[iteration])
    repo = _echo_repo(review)

    with pytest.raises(IterationLockedError):
        await DeleteCommentUseCase(repo).execute(review_id=review.id, iteration_id=iteration.id, comment_id=comment.id)
    repo.update.assert_not_awaited()
