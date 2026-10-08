"""Unit tests for what a model's answer may change on an iteration."""

from __future__ import annotations

from uuid import uuid4

import pytest
from mr_review.core.reviews.entities import Iteration, IterationStage
from mr_review.use_cases.reviews._answer_settlement import (
    RAW_RESPONSE_LIMIT,
    DispatchBaseline,
    bounded_raw_response,
    settle_dispatched_answer,
    settle_reparsed_answer,
)
from mr_review.use_cases.reviews.ai_response_parser import parse_ai_response

from tests.factories.entities import make_comment, make_iteration

pytestmark = pytest.mark.unit

_COMPLETE = '[{"body": "New"}]'
_TRUNCATED = '[{"body": "New"}, {"body": "Cut o'
_UNREADABLE = "Sorry, I cannot review this."
_BASELINE = DispatchBaseline(stage=IterationStage.polish, ai_provider_id=uuid4(), model="old-model")


def _dispatching(*, with_comments: bool) -> Iteration:
    comments = [make_comment(body="Old")] if with_comments else []
    return make_iteration(stage=IterationStage.dispatch, comments=comments, ai_provider_id=uuid4(), model="new-model")


@pytest.mark.parametrize(
    ("raw", "finished", "with_comments", "expected_bodies", "applied"),
    [
        (_COMPLETE, True, True, ["New"], True),
        ("[]", True, True, [], True),
        (_TRUNCATED, True, True, ["Old"], False),
        (_UNREADABLE, True, True, ["Old"], False),
        ("", True, True, ["Old"], False),
        (_COMPLETE, False, True, ["Old"], False),
        (_TRUNCATED, True, False, ["New"], True),
        (_UNREADABLE, True, False, [_UNREADABLE], True),
        ("", True, False, [], False),
        (_TRUNCATED, False, False, ["New"], True),
        (_UNREADABLE, False, False, [], False),
    ],
    ids=[
        "complete_replaces",
        "no_findings_replaces",
        "truncated_keeps",
        "unreadable_keeps",
        "empty_keeps",
        "interrupted_keeps",
        "truncated_fills_empty",
        "unreadable_fills_empty_with_one_general_comment",
        "empty_leaves_empty",
        "interrupted_salvage_fills_empty",
        "interrupted_prose_never_dumped",
    ],
)
def test__settle_dispatched_answer__rules(
    raw: str, finished: bool, with_comments: bool, expected_bodies: list[str], applied: bool
) -> None:
    iteration = _dispatching(with_comments=with_comments)

    settled = settle_dispatched_answer(iteration, _BASELINE, raw, parse_ai_response(raw), finished=finished)

    assert [c.body for c in settled.iteration.comments] == expected_bodies
    assert settled.applied is applied
    if applied:
        assert settled.iteration.stage == IterationStage.polish
        assert settled.iteration.raw_response == raw
        assert (settled.iteration.ai_provider_id, settled.iteration.model) == (iteration.ai_provider_id, "new-model")
    else:
        assert settled.iteration.stage == _BASELINE.stage
        assert settled.iteration.raw_response == iteration.raw_response
        assert (settled.iteration.ai_provider_id, settled.iteration.model) == (_BASELINE.ai_provider_id, "old-model")


@pytest.mark.parametrize(
    ("previous", "expected_stage"),
    [
        (None, IterationStage.brief),
        (make_iteration(stage=IterationStage.brief), IterationStage.brief),
        (make_iteration(stage=IterationStage.polish, comments=[make_comment()]), IterationStage.polish),
        (make_iteration(stage=IterationStage.dispatch, comments=[make_comment()]), IterationStage.polish),
        (make_iteration(stage=IterationStage.dispatch, comments=[]), IterationStage.brief),
    ],
    ids=["new", "brief", "polish", "stuck_with_comments", "stuck_without_comments"],
)
def test__dispatch_baseline__never_dispatch(previous: Iteration | None, expected_stage: IterationStage) -> None:
    assert DispatchBaseline.of(previous).stage == expected_stage


@pytest.mark.parametrize(
    ("raw", "with_comments", "expected_bodies", "applied"),
    [
        (_COMPLETE, True, ["New"], True),
        (_TRUNCATED, True, ["New"], True),
        (_UNREADABLE, True, ["Old"], False),
        (_UNREADABLE, False, [_UNREADABLE], True),
    ],
    ids=["readable", "truncated_but_readable", "unreadable_keeps_triage", "unreadable_fills_empty"],
)
def test__settle_reparsed_answer__rules(
    raw: str, with_comments: bool, expected_bodies: list[str], applied: bool
) -> None:
    comments = [make_comment(body="Old")] if with_comments else []
    iteration = make_iteration(stage=IterationStage.polish, comments=comments).model_copy(update={"raw_response": raw})

    settled = settle_reparsed_answer(iteration, parse_ai_response(raw))

    assert [c.body for c in settled.iteration.comments] == expected_bodies
    assert settled.applied is applied
    assert settled.iteration.raw_response == raw


def test__bounded_raw_response__fits__unchanged() -> None:
    raw = "x" * RAW_RESPONSE_LIMIT

    assert bounded_raw_response(raw) is raw


def test__bounded_raw_response__too_long__head_and_tail_around_a_marker() -> None:
    raw = "H" * RAW_RESPONSE_LIMIT + "T" * RAW_RESPONSE_LIMIT

    bounded = bounded_raw_response(raw)

    assert len(bounded) < RAW_RESPONSE_LIMIT + 100
    assert bounded.startswith("H" * 1000)
    assert bounded.endswith("T" * 1000)
    assert f"[… {RAW_RESPONSE_LIMIT} characters omitted …]" in bounded
