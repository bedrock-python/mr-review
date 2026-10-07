from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from mr_review.core.reviews.entities import BriefConfig, BriefPreset, IterationStage
from mr_review.use_cases.reviews.create_review import CreateReviewUseCase
from mr_review.use_cases.reviews.dto import CommentPatchDTO
from mr_review.use_cases.reviews.get_review import GetReviewUseCase
from mr_review.use_cases.reviews.iteration_comments import InvalidCommentPatchError, IterationLockedError
from mr_review.use_cases.reviews.list_reviews import ListReviewsUseCase
from mr_review.use_cases.reviews.update_review import UpdateReviewUseCase

from tests.factories.entities import make_brief_config, make_comment, make_iteration, make_review
from tests.fakes import SingleReviewRepository

pytestmark = pytest.mark.unit


async def test__create_review__valid_params__gets_or_creates_atomically() -> None:
    """CreateReviewUseCase.execute delegates to the repository's atomic get-or-create."""
    repo = AsyncMock()
    host_id = uuid4()
    expected = make_review(host_id=host_id, repo_path="ns/repo", mr_iid=7)
    repo.get_or_create_by_mr.return_value = expected
    use_case = CreateReviewUseCase(repo)

    result = await use_case.execute(host_id=host_id, repo_path="ns/repo", mr_iid=7)

    repo.get_or_create_by_mr.assert_awaited_once_with(host_id=host_id, repo_path="ns/repo", mr_iid=7, brief_config=None)
    repo.create.assert_not_called()
    assert result == expected


async def test__create_review__with_brief_config__passes_config_to_repo() -> None:
    """CreateReviewUseCase.execute forwards brief_config when provided."""
    repo = AsyncMock()
    host_id = uuid4()
    config = make_brief_config()
    expected = make_review(host_id=host_id, brief_config=config)
    repo.get_or_create_by_mr.return_value = expected
    use_case = CreateReviewUseCase(repo)

    result = await use_case.execute(host_id=host_id, repo_path="ns/repo", mr_iid=1, brief_config=config)

    repo.get_or_create_by_mr.assert_awaited_once_with(
        host_id=host_id, repo_path="ns/repo", mr_iid=1, brief_config=config
    )
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
    incomplete_iter = make_iteration(stage=IterationStage.brief, completed_at=None)
    original = make_review(iterations=[incomplete_iter])
    new_config = BriefConfig(preset=BriefPreset.security)
    repo = SingleReviewRepository(original)
    use_case = UpdateReviewUseCase(repo)

    result = await use_case.execute(review_id=original.id, brief_config=new_config)

    assert len(repo.writes) == 1
    persisted = repo.last_write
    assert persisted.iterations[-1].brief_config.preset == BriefPreset.security
    assert result.brief_config.preset == BriefPreset.security


async def test__update_review__iteration_stage_provided__persists_new_stage() -> None:
    """UpdateReviewUseCase.execute updates the iteration stage when iteration_id is given."""
    iteration = make_iteration(stage=IterationStage.dispatch, comments=[])
    original = make_review(iterations=[iteration])
    repo = SingleReviewRepository(original)
    use_case = UpdateReviewUseCase(repo)

    result = await use_case.execute(
        review_id=original.id,
        iteration_id=iteration.id,
        iteration_stage=IterationStage.polish,
    )

    assert len(repo.writes) == 1
    assert result.iterations[0].stage == IterationStage.polish


async def test__update_review__comment_patches__merged_against_the_review_it_reads() -> None:
    """Patches are resolved inside the use case, against the single read it persists from."""
    patched, untouched = make_comment(body="old", severity="minor"), make_comment(body="keep")
    iteration = make_iteration(comments=[patched, untouched])
    original = make_review(iterations=[iteration])
    repo = SingleReviewRepository(original)
    use_case = UpdateReviewUseCase(repo)

    result = await use_case.execute(
        review_id=original.id,
        iteration_id=iteration.id,
        comment_patches=[CommentPatchDTO(id=patched.id, body="new"), CommentPatchDTO(id=uuid4(), body="ghost")],
    )

    assert len(repo.writes) == 1
    assert [(c.body, c.severity) for c in result.iterations[0].comments] == [("new", "minor"), ("keep", "minor")]


async def test__update_review__invalid_comment_patch__raises_and_writes_nothing() -> None:
    """A patch that would leave a line on a general comment fails the whole update."""
    general = make_comment(file=None, line=None)
    iteration = make_iteration(comments=[general])
    repo = SingleReviewRepository(make_review(iterations=[iteration]))

    with pytest.raises(InvalidCommentPatchError):
        await UpdateReviewUseCase(repo).execute(
            review_id=uuid4(),
            iteration_id=iteration.id,
            comment_patches=[CommentPatchDTO(id=general.id, line=4)],
        )
    assert repo.writes == []


async def test__update_review__comment_patches_for_unknown_iteration__raises_value_error() -> None:
    """Patching an iteration the review does not have is a not-found error."""
    repo = SingleReviewRepository(make_review())
    missing = uuid4()

    with pytest.raises(ValueError, match=str(missing)):
        await UpdateReviewUseCase(repo).execute(
            review_id=uuid4(), iteration_id=missing, comment_patches=[CommentPatchDTO(id=uuid4(), body="x")]
        )
    assert repo.writes == []


async def test__update_review__review_not_found__raises_value_error() -> None:
    """UpdateReviewUseCase.execute raises ValueError when the review does not exist."""
    repo = SingleReviewRepository(None)
    use_case = UpdateReviewUseCase(repo)
    missing_id = uuid4()

    with pytest.raises(ValueError, match=str(missing_id)):
        await use_case.execute(review_id=missing_id, brief_config=BriefConfig())


async def test__update_review__no_fields_provided__persists_review_unchanged() -> None:
    """UpdateReviewUseCase.execute writes nothing when called with all None params."""
    original = make_review()
    repo = SingleReviewRepository(original)
    use_case = UpdateReviewUseCase(repo)

    result = await use_case.execute(review_id=original.id)

    assert repo.writes == []
    assert result == original


@pytest.mark.parametrize(
    "completed_at",
    [datetime.now(timezone.utc), None],
    ids=["posted-in-full", "posted-in-part"],
)
async def test__update_review__brief_config_on_posted_iteration__raises_iteration_locked(
    completed_at: datetime | None,
) -> None:
    """A brief saved after the last iteration reached Post — all or some of its comments — is refused."""
    posted_iter = make_iteration(stage=IterationStage.post, completed_at=completed_at)
    original = make_review(iterations=[posted_iter])
    repo = SingleReviewRepository(original)
    use_case = UpdateReviewUseCase(repo)

    with pytest.raises(IterationLockedError, match=str(posted_iter.id)):
        await use_case.execute(review_id=original.id, brief_config=BriefConfig(preset=BriefPreset.security))

    assert repo.writes == []
