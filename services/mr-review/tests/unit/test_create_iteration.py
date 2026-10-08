from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from mr_review.core.reviews.entities import BriefConfig, BriefPreset, IterationStage
from mr_review.use_cases.reviews.create_iteration import CreateIterationUseCase

from tests.factories.entities import make_iteration, make_review
from tests.fakes import stub_update_with

pytestmark = pytest.mark.unit


async def test__create_iteration__no_config__inherits_last_iteration_brief_config() -> None:
    """When brief_config is None, the new iteration inherits the last completed iteration's brief_config."""
    repo = AsyncMock()
    security_config = BriefConfig(preset=BriefPreset.security)
    completed_iter = make_iteration(number=1, brief_config=security_config, completed_at=datetime.now(timezone.utc))
    review = make_review(iterations=[completed_iter])
    writes = stub_update_with(repo, review)
    use_case = CreateIterationUseCase(repo)

    result = await use_case.execute(review_id=review.id)

    assert len(writes) == 1
    assert len(result.iterations) == 2
    new_iter = result.iterations[1]
    assert new_iter.brief_config == security_config
    assert new_iter.stage == IterationStage.brief
    repo.update.assert_not_called()


async def test__create_iteration__custom_config__uses_provided_config() -> None:
    """When brief_config is provided, the new iteration uses that config."""
    repo = AsyncMock()
    completed_iter = make_iteration(number=1, completed_at=datetime.now(timezone.utc))
    review = make_review(iterations=[completed_iter])
    custom_config = BriefConfig(preset=BriefPreset.performance)
    stub_update_with(repo, review)
    use_case = CreateIterationUseCase(repo)

    result = await use_case.execute(review_id=review.id, brief_config=custom_config)

    assert result.iterations[1].brief_config == custom_config


async def test__create_iteration__one_completed_iteration__new_number_is_two() -> None:
    """After one completed iteration, the new one gets number=2."""
    repo = AsyncMock()
    existing_iter = make_iteration(number=1, completed_at=datetime.now(timezone.utc))
    review = make_review(iterations=[existing_iter])
    stub_update_with(repo, review)
    use_case = CreateIterationUseCase(repo)

    result = await use_case.execute(review_id=review.id)

    assert len(result.iterations) == 2
    assert result.iterations[1].number == 2


async def test__create_iteration__new_iteration_stage_is_brief() -> None:
    """Newly created iteration is always in 'brief' stage."""
    repo = AsyncMock()
    existing_iter = make_iteration(number=1, completed_at=datetime.now(timezone.utc))
    review = make_review(iterations=[existing_iter])
    stub_update_with(repo, review)
    use_case = CreateIterationUseCase(repo)

    result = await use_case.execute(review_id=review.id)

    assert result.iterations[1].stage == IterationStage.brief


async def test__create_iteration__review_not_found__raises_value_error() -> None:
    """ValueError is raised when the review does not exist."""
    repo = AsyncMock()
    writes = stub_update_with(repo, None)
    use_case = CreateIterationUseCase(repo)
    missing_id = uuid4()

    with pytest.raises(ValueError, match=str(missing_id)):
        await use_case.execute(review_id=missing_id)

    assert writes == []


async def test__create_iteration__existing_completed_iterations_are_preserved() -> None:
    """The new iteration is appended; existing completed iterations are untouched."""
    repo = AsyncMock()
    now = datetime.now(timezone.utc)
    iter1 = make_iteration(number=1, completed_at=now)
    iter2 = make_iteration(number=2, completed_at=now)
    review = make_review(iterations=[iter1, iter2])
    stub_update_with(repo, review)
    use_case = CreateIterationUseCase(repo)

    result = await use_case.execute(review_id=review.id)

    assert result.iterations[0] is iter1
    assert result.iterations[1] is iter2
    assert result.iterations[2].number == 3


async def test__create_iteration__last_incomplete__returns_review_without_creating() -> None:
    """If the last iteration is not completed, no new iteration is created and review is returned as-is."""
    repo = AsyncMock()
    existing_iter = make_iteration(number=1, completed_at=None, stage=IterationStage.brief)
    review = make_review(iterations=[existing_iter])
    writes = stub_update_with(repo, review)
    use_case = CreateIterationUseCase(repo)

    result = await use_case.execute(review_id=review.id)

    assert writes == []
    assert result is review


async def test__create_iteration__last_partly_posted__starts_a_new_iteration() -> None:
    """An iteration with some comments on the MR (post stage, not completed) is not reused for a new review."""
    repo = AsyncMock()
    partly_posted = make_iteration(number=1, completed_at=None, stage=IterationStage.post)
    review = make_review(iterations=[partly_posted])
    stub_update_with(repo, review)
    use_case = CreateIterationUseCase(repo)

    result = await use_case.execute(review_id=review.id)

    assert [(it.number, it.stage) for it in result.iterations] == [(1, IterationStage.post), (2, IterationStage.brief)]


async def test__create_iteration__last_incomplete__new_config__updates_brief_config() -> None:
    """If last iteration is incomplete and a different config is provided, its brief_config is updated."""
    repo = AsyncMock()
    old_config = BriefConfig(preset=BriefPreset.thorough)
    new_config = BriefConfig(preset=BriefPreset.security)
    existing_iter = make_iteration(number=1, completed_at=None, stage=IterationStage.brief, brief_config=old_config)
    review = make_review(iterations=[existing_iter])
    writes = stub_update_with(repo, review)
    use_case = CreateIterationUseCase(repo)

    result = await use_case.execute(review_id=review.id, brief_config=new_config)

    assert len(writes) == 1
    assert result.iterations[0].brief_config == new_config
    assert len(result.iterations) == 1


async def test__create_iteration__last_incomplete__same_config__no_update() -> None:
    """If last iteration is incomplete and same config is provided, no update is made."""
    repo = AsyncMock()
    config = BriefConfig(preset=BriefPreset.security)
    existing_iter = make_iteration(number=1, completed_at=None, stage=IterationStage.brief, brief_config=config)
    review = make_review(iterations=[existing_iter])
    writes = stub_update_with(repo, review)
    use_case = CreateIterationUseCase(repo)

    result = await use_case.execute(review_id=review.id, brief_config=config)

    assert writes == []
    assert result is review
