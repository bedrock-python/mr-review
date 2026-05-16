from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from mr_review.core.reviews.entities import BriefConfig, BriefPreset, IterationStage
from mr_review.use_cases.reviews.create_review import CreateReviewUseCase
from mr_review.use_cases.reviews.get_review import GetReviewUseCase
from mr_review.use_cases.reviews.list_reviews import ListReviewsUseCase
from mr_review.use_cases.reviews.update_review import UpdateReviewUseCase

from tests.factories.entities import make_brief_config, make_comment, make_iteration, make_review

pytestmark = pytest.mark.unit


async def test__create_review__valid_params__delegates_to_repo_and_returns_entity() -> None:
    """CreateReviewUseCase.execute forwards all params to repo.create and returns its result."""
    repo = AsyncMock()
    host_id = uuid4()
    expected = make_review(host_id=host_id, repo_path="ns/repo", mr_iid=7)
    repo.get_by_mr.return_value = None
    repo.create.return_value = expected
    use_case = CreateReviewUseCase(repo)

    result = await use_case.execute(host_id=host_id, repo_path="ns/repo", mr_iid=7)

    repo.create.assert_awaited_once_with(host_id=host_id, repo_path="ns/repo", mr_iid=7, brief_config=None)
    assert result == expected


async def test__create_review__with_brief_config__passes_config_to_repo() -> None:
    """CreateReviewUseCase.execute forwards brief_config when provided."""
    repo = AsyncMock()
    host_id = uuid4()
    config = make_brief_config()
    expected = make_review(host_id=host_id, brief_config=config)
    repo.get_by_mr.return_value = None
    repo.create.return_value = expected
    use_case = CreateReviewUseCase(repo)

    result = await use_case.execute(host_id=host_id, repo_path="ns/repo", mr_iid=1, brief_config=config)

    repo.create.assert_awaited_once_with(host_id=host_id, repo_path="ns/repo", mr_iid=1, brief_config=config)
    assert result == expected


async def test__get_review__review_exists__returns_entity() -> None:
    """GetReviewUseCase.execute returns the review when the repo finds it."""
    repo = AsyncMock()
    review = make_review()
    repo.get_by_id.return_value = review
    use_case = GetReviewUseCase(repo)

    result = await use_case.execute(review.id)

    repo.get_by_id.assert_awaited_once_with(review.id)
    assert result == review


async def test__get_review__review_not_found__raises_value_error() -> None:
    """GetReviewUseCase.execute raises ValueError when the repo returns None."""
    repo = AsyncMock()
    repo.get_by_id.return_value = None
    use_case = GetReviewUseCase(repo)
    missing_id = uuid4()

    with pytest.raises(ValueError, match=str(missing_id)):
        await use_case.execute(missing_id)


async def test__list_reviews__repo_has_items__returns_all_reviews() -> None:
    """ListReviewsUseCase.execute returns every review returned by the repository."""
    repo = AsyncMock()
    reviews = [make_review() for _ in range(3)]
    repo.list_all.return_value = reviews
    use_case = ListReviewsUseCase(repo)

    result = await use_case.execute()

    assert result == reviews
    repo.list_all.assert_awaited_once()


async def test__list_reviews__repo_is_empty__returns_empty_list() -> None:
    """ListReviewsUseCase.execute returns an empty list when there are no reviews."""
    repo = AsyncMock()
    repo.list_all.return_value = []
    use_case = ListReviewsUseCase(repo)

    result = await use_case.execute()

    assert result == []


async def test__update_review__brief_config_provided__persists_new_config() -> None:
    """UpdateReviewUseCase.execute applies brief_config to the last incomplete iteration."""
    repo = AsyncMock()
    incomplete_iter = make_iteration(stage=IterationStage.brief, completed_at=None)
    original = make_review(iterations=[incomplete_iter])
    new_config = BriefConfig(preset=BriefPreset.security)
    updated_iter = incomplete_iter.model_copy(update={"brief_config": new_config})
    updated = original.model_copy(update={"iterations": [updated_iter]})
    repo.get_by_id.return_value = original
    repo.update.return_value = updated
    use_case = UpdateReviewUseCase(repo)

    result = await use_case.execute(review_id=original.id, brief_config=new_config)

    repo.get_by_id.assert_awaited_once_with(original.id)
    repo.update.assert_awaited_once()
    persisted = repo.update.call_args[0][0]
    assert persisted.iterations[-1].brief_config.preset == BriefPreset.security
    assert result.brief_config.preset == BriefPreset.security


async def test__update_review__iteration_stage_provided__persists_new_stage() -> None:
    """UpdateReviewUseCase.execute updates the iteration stage when iteration_id is given."""
    repo = AsyncMock()
    iteration = make_iteration(stage=IterationStage.dispatch, comments=[])
    original = make_review(iterations=[iteration])
    updated_iter = iteration.model_copy(update={"stage": IterationStage.polish})
    updated = original.model_copy(update={"iterations": [updated_iter]})
    repo.get_by_id.return_value = original
    repo.update.return_value = updated
    use_case = UpdateReviewUseCase(repo)

    result = await use_case.execute(
        review_id=original.id,
        iteration_id=iteration.id,
        iteration_stage=IterationStage.polish,
    )

    repo.update.assert_awaited_once()
    assert result.iterations[0].stage == IterationStage.polish


async def test__update_review__iteration_comments_provided__persists_new_comments() -> None:
    """UpdateReviewUseCase.execute replaces iteration comments when supplied."""
    repo = AsyncMock()
    iteration = make_iteration(comments=[])
    original = make_review(iterations=[iteration])
    comment = make_comment(body="critical issue")
    updated_iter = iteration.model_copy(update={"comments": [comment]})
    updated = original.model_copy(update={"iterations": [updated_iter]})
    repo.get_by_id.return_value = original
    repo.update.return_value = updated
    use_case = UpdateReviewUseCase(repo)

    result = await use_case.execute(
        review_id=original.id,
        iteration_id=iteration.id,
        iteration_comments=[comment],
    )

    repo.update.assert_awaited_once()
    assert len(result.iterations[0].comments) == 1
    assert result.iterations[0].comments[0].body == "critical issue"


async def test__update_review__review_not_found__raises_value_error() -> None:
    """UpdateReviewUseCase.execute raises ValueError when the review does not exist."""
    repo = AsyncMock()
    repo.get_by_id.return_value = None
    use_case = UpdateReviewUseCase(repo)
    missing_id = uuid4()

    with pytest.raises(ValueError, match=str(missing_id)):
        await use_case.execute(review_id=missing_id, brief_config=BriefConfig())


async def test__update_review__no_fields_provided__persists_review_unchanged() -> None:
    """UpdateReviewUseCase.execute is a no-op when called with all None params."""
    repo = AsyncMock()
    original = make_review()
    repo.get_by_id.return_value = original
    repo.update.return_value = original
    use_case = UpdateReviewUseCase(repo)

    result = await use_case.execute(review_id=original.id)

    repo.update.assert_awaited_once()
    assert result == original
