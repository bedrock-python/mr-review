"""Unit tests for keeping the model's raw answer: import, read back, and parse again."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from mr_review.core.reviews.entities import IterationStage, Review
from mr_review.use_cases.reviews.get_iteration_raw_response import GetIterationRawResponseUseCase
from mr_review.use_cases.reviews.import_response import ImportResponseUseCase
from mr_review.use_cases.reviews.iteration_comments import IterationLockedError
from mr_review.use_cases.reviews.reparse_iteration import ReparseIterationUseCase

from tests.factories.entities import make_comment, make_iteration, make_review

pytestmark = pytest.mark.unit

_ANSWER = "Sure:\n```json\n" + json.dumps([{"file": "a.py", "line": 2, "body": "Fresh"}]) + "\n```"


def _repo(review: Review | None) -> AsyncMock:
    repo = AsyncMock()
    repo.get_by_id.return_value = review
    repo.update.side_effect = lambda updated: updated
    return repo


def _saved(repo: AsyncMock) -> Review:
    return repo.update.call_args[0][0]


async def test__import_response__comments_parsed__raw_answer_stored_on_the_iteration() -> None:
    iteration = make_iteration(stage=IterationStage.brief)
    repo = _repo(make_review(iterations=[iteration]))

    result = await ImportResponseUseCase(repo).execute(uuid4(), _ANSWER, iteration_id=iteration.id)

    saved = _saved(repo).iterations[0]
    assert len(result.comments) == 1
    assert saved.raw_response == _ANSWER
    assert saved.stage == IterationStage.polish


async def test__import_response__nothing_parsed__review_untouched() -> None:
    repo = _repo(make_review(iterations=[make_iteration()]))

    result = await ImportResponseUseCase(repo).execute(uuid4(), "no json here")

    assert result.json_error is not None
    repo.update.assert_not_awaited()


async def test__get_raw_response__stored__returned_verbatim() -> None:
    iteration = make_iteration().model_copy(update={"raw_response": _ANSWER})
    use_case = GetIterationRawResponseUseCase(_repo(make_review(iterations=[iteration])))

    assert await use_case.execute(uuid4(), iteration.id) == _ANSWER


@pytest.mark.parametrize("missing", ["review", "iteration", "raw"])
async def test__get_raw_response__missing__value_error(missing: str) -> None:
    iteration = make_iteration()
    review = None if missing == "review" else make_review(iterations=[iteration])
    iteration_id = uuid4() if missing == "iteration" else iteration.id

    with pytest.raises(ValueError, match="not found|no stored model response"):
        await GetIterationRawResponseUseCase(_repo(review)).execute(uuid4(), iteration_id)


async def test__reparse__stored_answer__replaces_the_comments() -> None:
    iteration = make_iteration(stage=IterationStage.polish, comments=[make_comment(body="Stale")]).model_copy(
        update={"raw_response": _ANSWER}
    )
    repo = _repo(make_review(iterations=[iteration]))

    outcome = await ReparseIterationUseCase(repo).execute(uuid4(), iteration.id)

    saved = _saved(repo).iterations[0]
    assert outcome.stored == 1
    assert outcome.result.json_error is None
    assert [c.body for c in saved.comments] == ["Fresh"]
    assert saved.raw_response == _ANSWER


async def test__reparse__unparseable_answer__one_general_comment_like_a_dispatch() -> None:
    iteration = make_iteration(stage=IterationStage.polish).model_copy(update={"raw_response": "LGTM"})
    repo = _repo(make_review(iterations=[iteration]))

    outcome = await ReparseIterationUseCase(repo).execute(uuid4(), iteration.id)

    assert outcome.stored == 1
    assert outcome.result.json_error is not None
    assert [c.body for c in _saved(repo).iterations[0].comments] == ["LGTM"]


@pytest.mark.parametrize(
    "locked",
    [
        {"stage": IterationStage.post},
        {"completed_at": datetime.now(timezone.utc)},
    ],
    ids=["post_stage", "completed"],
)
async def test__reparse__posted_iteration__locked(locked: dict[str, object]) -> None:
    iteration = make_iteration().model_copy(update={"raw_response": _ANSWER, **locked})
    repo = _repo(make_review(iterations=[iteration]))

    with pytest.raises(IterationLockedError):
        await ReparseIterationUseCase(repo).execute(uuid4(), iteration.id)

    repo.update.assert_not_awaited()


async def test__reparse__no_stored_answer__value_error() -> None:
    iteration = make_iteration()
    repo = _repo(make_review(iterations=[iteration]))

    with pytest.raises(ValueError, match="no stored model response"):
        await ReparseIterationUseCase(repo).execute(uuid4(), iteration.id)
