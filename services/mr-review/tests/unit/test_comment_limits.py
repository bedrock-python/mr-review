"""The brief's minimum severity and comment cap, enforced wherever parsed comments are stored."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from mr_review.core.ai.entities import DispatchOptions
from mr_review.core.reviews.entities import BriefConfig, Comment, Iteration, IterationStage, Review
from mr_review.core.reviews.severity import Severity
from mr_review.use_cases.reviews._answer_settlement import (
    DispatchBaseline,
    settle_dispatched_answer,
    settle_reparsed_answer,
)
from mr_review.use_cases.reviews.ai_response_parser import parse_ai_response
from mr_review.use_cases.reviews.comment_limits import limit_comments
from mr_review.use_cases.reviews.dispatch_review import DispatchCompleted, DispatchReviewUseCase
from mr_review.use_cases.reviews.import_response import ImportResponseUseCase
from mr_review.use_cases.reviews.reparse_iteration import ReparseIterationUseCase

from tests.factories.entities import make_ai_provider, make_comment, make_iteration, make_review
from tests.fakes import SingleReviewRepository

pytestmark = pytest.mark.unit

_SEVERITIES: list[Severity] = ["suggestion", "critical", "minor", "major", "critical", "suggestion"]
# One comment per severity above, in that order, bodies "c0" … "c5".
_ANSWER = json.dumps(
    [{"file": "a.py", "line": i + 1, "severity": s, "body": f"c{i}"} for i, s in enumerate(_SEVERITIES)]
)
_BASELINE = DispatchBaseline(stage=IterationStage.brief, ai_provider_id=None, model=None)


def _comments() -> list[Comment]:
    return [make_comment(severity=s, body=f"c{i}") for i, s in enumerate(_SEVERITIES)]


def _bodies(comments: list[Comment]) -> list[str]:
    return [c.body for c in comments]


def _iteration(brief: BriefConfig, *, comments: list[Comment] | None = None) -> Iteration:
    return make_iteration(stage=IterationStage.dispatch, comments=comments or [], brief_config=brief)


def test__limit__defaults__everything_kept() -> None:
    limited = limit_comments(_comments(), "suggestion", None)

    assert _bodies(limited.comments) == ["c0", "c1", "c2", "c3", "c4", "c5"]
    assert limited.filtered == 0


def test__limit__min_severity__lower_ones_dropped() -> None:
    limited = limit_comments(_comments(), "major", None)

    assert _bodies(limited.comments) == ["c1", "c3", "c4"]
    assert limited.filtered == 3


def test__limit__cap__most_severe_kept_in_the_models_order() -> None:
    limited = limit_comments(_comments(), "suggestion", 3)

    assert _bodies(limited.comments) == ["c1", "c3", "c4"]
    assert limited.filtered == 3


def test__limit__cap_ties__earlier_comment_wins() -> None:
    limited = limit_comments(_comments(), "suggestion", 4)

    assert _bodies(limited.comments) == ["c1", "c2", "c3", "c4"]


def test__settle__complete_answer__stored_within_the_brief() -> None:
    iteration = _iteration(BriefConfig(min_severity="major"))

    settled = settle_dispatched_answer(iteration, _BASELINE, _ANSWER, parse_ai_response(_ANSWER), finished=True)

    assert settled.applied is True
    assert _bodies(settled.iteration.comments) == ["c1", "c3", "c4"]
    assert settled.filtered == 3


def test__settle__salvaged_from_an_interrupted_answer__limited_too() -> None:
    iteration = _iteration(BriefConfig(max_comments=2))
    partial = _ANSWER[:-1]

    settled = settle_dispatched_answer(iteration, _BASELINE, partial, parse_ai_response(partial), finished=False)

    assert _bodies(settled.iteration.comments) == ["c1", "c4"]
    assert settled.filtered == 4


def test__settle__everything_salvaged_below_the_floor__nothing_stored() -> None:
    iteration = _iteration(BriefConfig(min_severity="critical"))
    partial = json.dumps([{"file": "a.py", "line": 1, "severity": "minor", "body": "nit"}])[:-1]

    settled = settle_dispatched_answer(iteration, _BASELINE, partial, parse_ai_response(partial), finished=False)

    assert settled.applied is False
    assert settled.iteration.comments == []


def test__settle__unreadable_answer__its_general_comment_never_filtered() -> None:
    iteration = _iteration(BriefConfig(min_severity="critical", max_comments=1))
    raw = "I could not find anything to say in JSON."

    settled = settle_dispatched_answer(iteration, _BASELINE, raw, parse_ai_response(raw), finished=True)

    assert [(c.severity, c.body) for c in settled.iteration.comments] == [("suggestion", raw)]
    assert settled.filtered == 0


def test__settle_reparse__limited_and_reported() -> None:
    iteration = make_iteration(
        stage=IterationStage.polish, brief_config=BriefConfig(min_severity="minor", max_comments=3)
    ).model_copy(update={"raw_response": _ANSWER})

    settled = settle_reparsed_answer(iteration, parse_ai_response(_ANSWER))

    assert _bodies(settled.iteration.comments) == ["c1", "c3", "c4"]
    assert settled.filtered == 3


def _repo(review: Review) -> SingleReviewRepository:
    return SingleReviewRepository(review)


def _stored(repo: SingleReviewRepository) -> list[Comment]:
    saved = repo.last_write
    return saved.iterations[-1].comments


async def _answer(*_args: object) -> AsyncIterator[str]:
    async def stream() -> AsyncIterator[str]:
        yield _ANSWER

    return stream()


async def test__dispatch__done_reports_how_many_were_filtered() -> None:
    iteration = make_iteration(stage=IterationStage.brief, brief_config=BriefConfig(min_severity="major"))
    repo = _repo(make_review(iterations=[iteration]))
    use_case = DispatchReviewUseCase(repo, AsyncMock(), AsyncMock(), MagicMock(), _answer)
    stream = use_case._stream_and_save(  # noqa: SLF001
        uuid4(), iteration.id, "prompt", make_ai_provider(), options=DispatchOptions(model="m")
    )

    events = [event async for event in stream]

    done = events[-1]
    assert isinstance(done, DispatchCompleted)
    assert (done.comments, done.filtered, done.kept_previous) == (3, 3, False)
    assert _bodies(_stored(repo)) == ["c1", "c3", "c4"]


async def test__import__limits_applied_and_reported() -> None:
    iteration = make_iteration(stage=IterationStage.brief, brief_config=BriefConfig(max_comments=2))
    repo = _repo(make_review(iterations=[iteration]))

    outcome = await ImportResponseUseCase(repo).execute(uuid4(), _ANSWER, iteration_id=iteration.id)

    assert (outcome.stored, outcome.filtered) == (2, 4)
    assert _bodies(_stored(repo)) == ["c1", "c4"]


async def test__reparse__limits_applied_and_reported() -> None:
    iteration = make_iteration(
        stage=IterationStage.polish, brief_config=BriefConfig(min_severity="minor", max_comments=3)
    ).model_copy(update={"raw_response": _ANSWER})
    repo = _repo(make_review(iterations=[iteration]))

    outcome = await ReparseIterationUseCase(repo).execute(uuid4(), iteration.id)

    assert (outcome.stored, outcome.filtered) == (3, 3)
    assert _bodies(_stored(repo)) == ["c1", "c3", "c4"]
