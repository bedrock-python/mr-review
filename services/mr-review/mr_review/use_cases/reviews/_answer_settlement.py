"""What a model's answer may change on an iteration — pure decisions, shared by every writer.

Two rules keep a user's work safe:

* comments that came from a previous answer are replaced only by a complete, readable new answer.
  An answer that failed to parse, was cut off by the token limit, or was interrupted (provider
  error, client gone) leaves them as they were;
* ``raw_response`` is always the answer the iteration's current comments were read from, so that
  re-parsing it can never rebuild comments from the fragment of an answer that was not used.

Parsed comments are stored within the iteration's brief: below its minimum severity they are
dropped, and past its comment cap only the most severe are kept. The general comment holding an
unreadable answer is never filtered.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Final
from uuid import UUID

from mr_review.core.reviews.entities import Comment, Iteration, IterationStage
from mr_review.use_cases.reviews.ai_response_parser import ParseResult
from mr_review.use_cases.reviews.comment_limits import LimitedComments, limit_comments

# Answers above this size are stored as their head and tail: review listings read every stored
# answer, and a runaway generation must not make them slow.
RAW_RESPONSE_LIMIT: Final = 512_000
_RAW_RESPONSE_HEAD: Final = RAW_RESPONSE_LIMIT * 3 // 4


def bounded_raw_response(raw: str) -> str:
    """``raw`` as stored: whole when it fits, otherwise its head and tail around a marker."""
    if len(raw) <= RAW_RESPONSE_LIMIT:
        return raw
    tail = RAW_RESPONSE_LIMIT - _RAW_RESPONSE_HEAD
    omitted = len(raw) - RAW_RESPONSE_LIMIT
    return f"{raw[:_RAW_RESPONSE_HEAD]}\n\n[… {omitted} characters omitted …]\n\n{raw[-tail:]}"


@dataclass(frozen=True, slots=True)
class DispatchBaseline:
    """What an iteration looked like before a dispatch, to return to when its answer is not used."""

    stage: IterationStage
    ai_provider_id: UUID | None
    model: str | None

    @classmethod
    def of(cls, iteration: Iteration | None) -> DispatchBaseline:
        """The baseline of ``iteration``; a new iteration (``None``) goes back to ``brief``.

        An iteration left in ``dispatch`` by an earlier run that never finished returns to the
        stage its comments imply, so that after a dispatch no iteration is ever left in it.
        """
        if iteration is None:
            return cls(stage=IterationStage.brief, ai_provider_id=None, model=None)
        stage = iteration.stage
        if stage == IterationStage.dispatch:
            stage = IterationStage.polish if iteration.comments else IterationStage.brief
        return cls(stage=stage, ai_provider_id=iteration.ai_provider_id, model=iteration.model)


@dataclass(frozen=True, slots=True)
class SettledAnswer:
    iteration: Iteration
    # False when the answer was not used and the iteration kept what it had.
    applied: bool
    # Parsed comments the brief's minimum severity or comment cap left out of what was stored.
    filtered: int = 0


def within_brief(iteration: Iteration, comments: list[Comment]) -> LimitedComments:
    """``comments`` within the iteration's minimum severity and comment cap."""
    brief = iteration.brief_config
    return limit_comments(comments, brief.min_severity, brief.max_comments)


def _store_answer(iteration: Iteration, comments: LimitedComments, raw: str) -> SettledAnswer:
    updated = iteration.model_copy(
        update={
            "stage": IterationStage.polish,
            "comments": comments.comments,
            "raw_response": bounded_raw_response(raw),
        }
    )
    return SettledAnswer(iteration=updated, applied=True, filtered=comments.filtered)


def _unfiltered(comments: list[Comment]) -> LimitedComments:
    return LimitedComments(comments=comments, filtered=0)


def settle_dispatched_answer(
    iteration: Iteration,
    baseline: DispatchBaseline,
    raw: str,
    result: ParseResult,
    *,
    finished: bool,
) -> SettledAnswer:
    """The iteration after a dispatch; ``finished`` is False when the stream was interrupted.

    A finished, complete answer replaces the comments, even with none ("no findings"). Otherwise
    an iteration without comments takes whatever can be read — complete comments salvaged from an
    interrupted answer, or, for a finished one, the general comment holding an unreadable answer —
    and an iteration with comments keeps them and returns to its baseline.
    """
    if finished and result.json_error is None and not result.truncated:
        return _store_answer(iteration, within_brief(iteration, result.comments), raw)
    if finished and result.json_error is not None:
        salvaged = _unfiltered(result.comments_to_store())
    else:
        salvaged = within_brief(iteration, result.comments)
    if not iteration.comments and salvaged.comments:
        return _store_answer(iteration, salvaged, raw)
    kept = iteration.model_copy(
        update={"stage": baseline.stage, "ai_provider_id": baseline.ai_provider_id, "model": baseline.model}
    )
    return SettledAnswer(iteration=kept, applied=False)


def settle_reparsed_answer(iteration: Iteration, result: ParseResult) -> SettledAnswer:
    """The iteration after its stored answer was parsed again.

    The comments came from that same answer, so any readable result replaces them — but an answer
    that still cannot be read never swaps comments someone may have triaged for a raw-text dump.
    """
    raw = iteration.raw_response or ""
    if result.json_error is None:
        return _store_answer(iteration, within_brief(iteration, result.comments), raw)
    fallback = result.comments_to_store()
    if not iteration.comments and fallback:
        return _store_answer(iteration, _unfiltered(fallback), raw)
    return SettledAnswer(iteration=iteration, applied=False)
