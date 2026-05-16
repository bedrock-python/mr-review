from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from mr_review.core.reviews.entities import BriefConfig, BriefPreset, IterationStage
from mr_review.use_cases.reviews.create_iteration import CreateIterationUseCase

from tests.factories.entities import make_iteration, make_review

pytestmark = pytest.mark.unit


async def test__create_iteration__no_config__inherits_last_iteration_brief_config() -> None:
    """When brief_config is None, the new iteration inherits the last completed iteration's brief_config."""
    repo = AsyncMock()
    security_config = BriefConfig(preset=BriefPreset.security)
    completed_iter = make_iteration(number=1, brief_config=security_config, completed_at=datetime.now(timezone.utc))
    review = make_review(iterations=[completed_iter])
    updated_review = make_review(
        id=review.id,
        iterations=[completed_iter, make_iteration(number=2, brief_config=security_config, stage=IterationStage.brief)],
    )
    repo.get_by_id.return_value = review
    repo.update.return_value = updated_review
    use_case = CreateIterationUseCase(repo)

    result = await use_case.execute(review_id=review.id)

    repo.get_by_id.assert_awaited_once_with(review.id)
    repo.update.assert_awaited_once()
    persisted_review = repo.update.call_args[0][0]
    assert len(persisted_review.iterations) == 2
    new_iter = persisted_review.iterations[1]
    assert new_iter.brief_config == security_config
    assert new_iter.stage == IterationStage.brief
    assert result == updated_review


async def test__create_iteration__custom_config__uses_provided_config() -> None:
    """When brief_config is provided, the new iteration uses that config."""
    repo = AsyncMock()
    completed_iter = make_iteration(number=1, completed_at=datetime.now(timezone.utc))
    review = make_review(iterations=[completed_iter])
    custom_config = BriefConfig(preset=BriefPreset.performance)
    updated_review = make_review(
        id=review.id,
        iterations=[completed_iter, make_iteration(number=2, brief_config=custom_config, stage=IterationStage.brief)],
    )
    repo.get_by_id.return_value = review
    repo.update.return_value = updated_review
    use_case = CreateIterationUseCase(repo)

    result = await use_case.execute(review_id=review.id, brief_config=custom_config)

    persisted_review = repo.update.call_args[0][0]
    assert persisted_review.iterations[1].brief_config == custom_config
    assert result == updated_review


async def test__create_iteration__number_increments_from_completed_iterations() -> None:
    """The new iteration's number is len(existing_iterations) + 1 when all previous are completed."""
    repo = AsyncMock()
    existing_iter = make_iteration(number=1, completed_at=datetime.now(timezone.utc))
    review = make_review(iterations=[existing_iter])
    repo.get_by_id.return_value = review
    repo.update.return_value = review
    use_case = CreateIterationUseCase(repo)

    await use_case.execute(review_id=review.id)

    persisted_review = repo.update.call_args[0][0]
    assert len(persisted_review.iterations) == 2
    assert persisted_review.iterations[1].number == 2


async def test__create_iteration__one_completed_iteration__new_number_is_two() -> None:
    """After one completed iteration, the new one gets number=2."""
    repo = AsyncMock()
    existing_iter = make_iteration(number=1, completed_at=datetime.now(timezone.utc))
    review = make_review(iterations=[existing_iter])
    repo.get_by_id.return_value = review
    repo.update.return_value = review
    use_case = CreateIterationUseCase(repo)

    await use_case.execute(review_id=review.id)

    persisted_review = repo.update.call_args[0][0]
    assert persisted_review.iterations[1].number == 2


async def test__create_iteration__new_iteration_stage_is_brief() -> None:
    """Newly created iteration is always in 'brief' stage."""
    repo = AsyncMock()
    existing_iter = make_iteration(number=1, completed_at=datetime.now(timezone.utc))
    review = make_review(iterations=[existing_iter])
    repo.get_by_id.return_value = review
    repo.update.return_value = review
    use_case = CreateIterationUseCase(repo)

    await use_case.execute(review_id=review.id)

    persisted_review = repo.update.call_args[0][0]
    assert persisted_review.iterations[1].stage == IterationStage.brief


async def test__create_iteration__review_not_found__raises_value_error() -> None:
    """ValueError is raised when the review does not exist."""
    repo = AsyncMock()
    repo.get_by_id.return_value = None
    use_case = CreateIterationUseCase(repo)
    missing_id = uuid4()

    with pytest.raises(ValueError, match=str(missing_id)):
        await use_case.execute(review_id=missing_id)

    repo.update.assert_not_awaited()


async def test__create_iteration__existing_completed_iterations_are_preserved() -> None:
    """The new iteration is appended; existing completed iterations are untouched."""
    repo = AsyncMock()
    now = datetime.now(timezone.utc)
    iter1 = make_iteration(number=1, completed_at=now)
    iter2 = make_iteration(number=2, completed_at=now)
    review = make_review(iterations=[iter1, iter2])
    repo.get_by_id.return_value = review
    repo.update.return_value = review
    use_case = CreateIterationUseCase(repo)

    await use_case.execute(review_id=review.id)

    persisted_review = repo.update.call_args[0][0]
    assert persisted_review.iterations[0] is iter1
    assert persisted_review.iterations[1] is iter2
    assert persisted_review.iterations[2].number == 3


async def test__create_iteration__last_incomplete__returns_review_without_creating() -> None:
    """If the last iteration is not completed, no new iteration is created and review is returned as-is."""
    repo = AsyncMock()
    existing_iter = make_iteration(number=1, completed_at=None, stage=IterationStage.brief)
    review = make_review(iterations=[existing_iter])
    repo.get_by_id.return_value = review
    use_case = CreateIterationUseCase(repo)

    result = await use_case.execute(review_id=review.id)

    repo.update.assert_not_awaited()
    assert result is review


async def test__create_iteration__last_incomplete__new_config__updates_brief_config() -> None:
    """If last iteration is incomplete and a different config is provided, its brief_config is updated."""
    repo = AsyncMock()
    old_config = BriefConfig(preset=BriefPreset.thorough)
    new_config = BriefConfig(preset=BriefPreset.security)
    existing_iter = make_iteration(number=1, completed_at=None, stage=IterationStage.brief, brief_config=old_config)
    review = make_review(iterations=[existing_iter])
    updated_review = make_review(id=review.id, iterations=[make_iteration(number=1, brief_config=new_config)])
    repo.get_by_id.return_value = review
    repo.update.return_value = updated_review
    use_case = CreateIterationUseCase(repo)

    result = await use_case.execute(review_id=review.id, brief_config=new_config)

    repo.update.assert_awaited_once()
    persisted_review = repo.update.call_args[0][0]
    assert persisted_review.iterations[0].brief_config == new_config
    assert len(persisted_review.iterations) == 1
    assert result == updated_review


async def test__create_iteration__last_incomplete__same_config__no_update() -> None:
    """If last iteration is incomplete and same config is provided, no update is made."""
    repo = AsyncMock()
    config = BriefConfig(preset=BriefPreset.security)
    existing_iter = make_iteration(number=1, completed_at=None, stage=IterationStage.brief, brief_config=config)
    review = make_review(iterations=[existing_iter])
    repo.get_by_id.return_value = review
    use_case = CreateIterationUseCase(repo)

    result = await use_case.execute(review_id=review.id, brief_config=config)

    repo.update.assert_not_awaited()
    assert result is review
