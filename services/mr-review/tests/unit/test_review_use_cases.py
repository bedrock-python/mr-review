from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from mr_review.core.reviews.entities import ReviewStage
from mr_review.use_cases.reviews.create_review import CreateReviewUseCase
from mr_review.use_cases.reviews.get_review import GetReviewUseCase
from mr_review.use_cases.reviews.list_reviews import ListReviewsUseCase
from mr_review.use_cases.reviews.update_review import UpdateReviewUseCase

from tests.factories.entities import make_brief_config, make_comment, make_review

pytestmark = pytest.mark.unit


async def test__create_review__valid_params__delegates_to_repo_and_returns_entity() -> None:
    """CreateReviewUseCase.execute forwards all params to repo.create and returns its result."""
    # Arrange
    repo = AsyncMock()
    host_id = uuid4()
    expected = make_review(host_id=host_id, repo_path="ns/repo", mr_iid=7)
    repo.create.return_value = expected
    use_case = CreateReviewUseCase(repo)

    # Act
    result = await use_case.execute(host_id=host_id, repo_path="ns/repo", mr_iid=7)

    # Assert
    repo.create.assert_awaited_once_with(host_id=host_id, repo_path="ns/repo", mr_iid=7, brief_config=None)
    assert result == expected


async def test__create_review__with_brief_config__passes_config_to_repo() -> None:
    """CreateReviewUseCase.execute forwards brief_config when provided."""
    # Arrange
    repo = AsyncMock()
    host_id = uuid4()
    config = make_brief_config()
    expected = make_review(host_id=host_id, brief_config=config)
    repo.create.return_value = expected
    use_case = CreateReviewUseCase(repo)

    # Act
    result = await use_case.execute(host_id=host_id, repo_path="ns/repo", mr_iid=1, brief_config=config)

    # Assert
    repo.create.assert_awaited_once_with(host_id=host_id, repo_path="ns/repo", mr_iid=1, brief_config=config)
    assert result == expected


async def test__get_review__review_exists__returns_entity() -> None:
    """GetReviewUseCase.execute returns the review when the repo finds it."""
    # Arrange
    repo = AsyncMock()
    review = make_review()
    repo.get_by_id.return_value = review
    use_case = GetReviewUseCase(repo)

    # Act
    result = await use_case.execute(review.id)

    # Assert
    repo.get_by_id.assert_awaited_once_with(review.id)
    assert result == review


async def test__get_review__review_not_found__raises_value_error() -> None:
    """GetReviewUseCase.execute raises ValueError when the repo returns None."""
    # Arrange
    repo = AsyncMock()
    repo.get_by_id.return_value = None
    use_case = GetReviewUseCase(repo)
    missing_id = uuid4()

    # Act / Assert
    with pytest.raises(ValueError, match=str(missing_id)):
        await use_case.execute(missing_id)


async def test__list_reviews__repo_has_items__returns_all_reviews() -> None:
    """ListReviewsUseCase.execute returns every review returned by the repository."""
    # Arrange
    repo = AsyncMock()
    reviews = [make_review() for _ in range(3)]
    repo.list_all.return_value = reviews
    use_case = ListReviewsUseCase(repo)

    # Act
    result = await use_case.execute()

    # Assert
    assert result == reviews
    repo.list_all.assert_awaited_once()


async def test__list_reviews__repo_is_empty__returns_empty_list() -> None:
    """ListReviewsUseCase.execute returns an empty list when there are no reviews."""
    # Arrange
    repo = AsyncMock()
    repo.list_all.return_value = []
    use_case = ListReviewsUseCase(repo)

    # Act
    result = await use_case.execute()

    # Assert
    assert result == []


async def test__update_review__stage_provided__updates_stage_and_returns_entity() -> None:
    """UpdateReviewUseCase.execute fetches the review, applies stage, and persists it."""
    # Arrange
    repo = AsyncMock()
    original = make_review(stage=ReviewStage.pick)
    updated = original.model_copy(update={"stage": ReviewStage.polish})
    repo.get_by_id.return_value = original
    repo.update.return_value = updated
    use_case = UpdateReviewUseCase(repo)

    # Act
    result = await use_case.execute(review_id=original.id, stage=ReviewStage.polish)

    # Assert
    repo.get_by_id.assert_awaited_once_with(original.id)
    repo.update.assert_awaited_once()
    assert result.stage == ReviewStage.polish


async def test__update_review__comments_provided__persists_new_comments() -> None:
    """UpdateReviewUseCase.execute replaces comments when a list is supplied."""
    # Arrange
    repo = AsyncMock()
    original = make_review(comments=[])
    comment = make_comment(body="critical issue")
    updated = original.model_copy(update={"comments": [comment]})
    repo.get_by_id.return_value = original
    repo.update.return_value = updated
    use_case = UpdateReviewUseCase(repo)

    # Act
    result = await use_case.execute(review_id=original.id, comments=[comment])

    # Assert
    repo.update.assert_awaited_once()
    assert len(result.comments) == 1
    assert result.comments[0].body == "critical issue"


async def test__update_review__review_not_found__raises_value_error() -> None:
    """UpdateReviewUseCase.execute raises ValueError when the review does not exist."""
    # Arrange
    repo = AsyncMock()
    repo.get_by_id.return_value = None
    use_case = UpdateReviewUseCase(repo)
    missing_id = uuid4()

    # Act / Assert
    with pytest.raises(ValueError, match=str(missing_id)):
        await use_case.execute(review_id=missing_id, stage=ReviewStage.polish)


async def test__update_review__no_fields_provided__persists_review_unchanged() -> None:
    """UpdateReviewUseCase.execute is a no-op when called with all None params."""
    # Arrange
    repo = AsyncMock()
    original = make_review()
    repo.get_by_id.return_value = original
    repo.update.return_value = original
    use_case = UpdateReviewUseCase(repo)

    # Act
    result = await use_case.execute(review_id=original.id)

    # Assert
    repo.update.assert_awaited_once()
    assert result == original
