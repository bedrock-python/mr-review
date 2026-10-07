"""Turning a model's complete answer into review comments.

Models are asked for a bare JSON array and mostly, not always, comply. The answer is treated as
text with JSON somewhere in it, and the parser keeps whichever of these readings yields the most
valid comments (the earliest one on a tie):

1. the whole answer, reasoning blocks removed;
2. every markdown fence — recognised only at the start of a line, because a fence inside a
   comment body sits mid-line: a JSON string cannot contain a raw newline;
3. every balanced top-level JSON value, decoded as a whole;
4. the comment objects cut out of each of those values one at a time, which also keeps every
   complete comment of an array that was cut off when the model hit its token limit;
5. all standalone comment objects together — one object per line.

Text readings are decoded with ``json.loads(strict=False)`` and then after a light repair; only
when none of them yields anything is the ``json-repair`` package tried on them, within a size
budget. Only the whole answer or a fence may stand for "no findings" (an empty array): an ``[]``
quoted in prose must not swallow the prose.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Final
from uuid import uuid4

from mr_review.core.reviews.entities import Comment
from mr_review.use_cases.reviews._ai_payload import (
    CommentParseError,
    Decoded,
    ParsedComment,
    RepairBudget,
    decode_exact,
    decode_repaired,
    extract_items,
    normalize_comment,
    parse_item_text,
)
from mr_review.use_cases.reviews.ai_response_stream import (
    JsonStructureScanner,
    ScannedValue,
    StreamingCommentParser,
    strip_reasoning,
)

__all__ = [
    "CommentParseError",
    "ParseResult",
    "ParsedComment",
    "StreamingCommentParser",
    "parse_ai_response",
]

_MAX_SCANS: Final = 4
_FENCE_RE: Final = re.compile(
    r"^[ \t]*(?P<fence>`{3,}|~{3,})[^\n]*\n(?P<body>.*?)(?:(?P<close>^[ \t]*(?P=fence)[ \t]*$)|\Z)",
    re.MULTILINE | re.DOTALL,
)


@dataclass
class ParseResult:
    comments: list[Comment] = field(default_factory=list)
    errors: list[CommentParseError] = field(default_factory=list)
    json_error: str | None = None
    # The answer stops inside a JSON value or a reasoning block: the model most likely ran into
    # its output token limit. Complete comments before the cut are still in ``comments``.
    truncated: bool = False
    # The answer without reasoning, kept as one general comment when nothing could be parsed.
    fallback_body: str = ""

    def comments_to_store(self) -> list[Comment]:
        """The parsed comments or, when nothing parsed, one general comment so the answer is never lost."""
        if self.json_error is None or not self.fallback_body:
            return list(self.comments)
        return [Comment(id=uuid4(), file=None, line=None, severity="suggestion", body=self.fallback_body)]


@dataclass(frozen=True, slots=True)
class _Candidate:
    text: str
    # json-repair would invent the missing end of a value cut off at the end of the answer, so it
    # is not let near one; reading 4 keeps the complete comments of such a value instead.
    repairable: bool
    # The whole answer or a fence: the only readings that may mean "no findings" or "all rejected".
    primary: bool


@dataclass
class _Reading:
    comments: list[ParsedComment] = field(default_factory=list)
    errors: list[CommentParseError] = field(default_factory=list)
    # True when the items came out of a JSON array, so that an empty reading means "no findings".
    from_array: bool = True

    def add(self, parsed: ParsedComment | CommentParseError) -> None:
        if isinstance(parsed, ParsedComment):
            self.comments.append(parsed)
        else:
            self.errors.append(parsed)


class _Selection:
    """Keeps the best reading offered: most comments, else a clean empty array, else the rejects."""

    def __init__(self) -> None:
        self.best: _Reading | None = None
        self.empty = False
        self.rejected: _Reading | None = None

    @property
    def found(self) -> bool:
        return self.best is not None or self.empty or self.rejected is not None

    def offer(self, reading: _Reading | None, *, trusted: bool, primary: bool) -> None:
        if reading is None:
            return
        if reading.comments:
            if self.best is None or len(reading.comments) > len(self.best.comments):
                self.best = reading
        # json-repair makes *something* out of any text, so its output only counts with comments.
        elif trusted and primary:
            if reading.errors:
                self.rejected = self.rejected or reading
            elif reading.from_array:
                self.empty = True

    def result(self, text: str, *, truncated: bool) -> ParseResult:
        if self.best is not None:
            comments = [_to_comment(c) for c in self.best.comments]
            return ParseResult(comments=comments, errors=self.best.errors, truncated=truncated)
        if self.empty:
            return ParseResult(truncated=truncated)
        if self.rejected is not None:
            errors = self.rejected.errors
            reason = f"No usable review comments: {len(errors)} item(s) rejected, e.g. {errors[0].reason}"
            return ParseResult(errors=errors, json_error=reason, truncated=truncated, fallback_body=text)
        return ParseResult(json_error=_describe_failure(text), truncated=truncated, fallback_body=text)


def _describe_failure(text: str) -> str:
    try:
        value = json.loads(text, strict=False)
    except (ValueError, RecursionError) as exc:
        return f"Invalid JSON: {exc}"
    return f"Expected a JSON array of comments, got {type(value).__name__}"


def _to_comment(parsed: ParsedComment) -> Comment:
    return Comment(id=uuid4(), file=parsed.file, line=parsed.line, severity=parsed.severity, body=parsed.body)


def _read_value(value: object) -> _Reading | None:
    extracted = extract_items(value)
    if extracted is None:
        return None
    items, from_array = extracted
    reading = _Reading(from_array=from_array)
    for index, item in enumerate(items):
        reading.add(normalize_comment(index, item))
    return reading


def _read_objects(texts: list[str], budget: RepairBudget) -> _Reading:
    reading = _Reading()
    for index, text in enumerate(texts):
        reading.add(parse_item_text(index, text, budget))
    return reading


def _scan(text: str) -> list[ScannedValue]:
    """Top-level JSON values in ``text``.

    When the last one never closes, the rest of the text is scanned again from just past its
    opening bracket — a few times at most: an unbalanced bracket in a preamble must not hide the
    answer that follows it.
    """
    values: list[ScannedValue] = []
    start = 0
    for _ in range(_MAX_SCANS):
        scanner = JsonStructureScanner(record_values=True, offset=start)
        scanner.feed(text[start:])
        values.extend(scanner.values)
        if not _ends_open(scanner.values):
            break
        start = scanner.values[-1].start + 1
    return values


def _ends_open(values: list[ScannedValue]) -> bool:
    return bool(values) and values[-1].end is None


def _text_candidates(text: str, values: list[ScannedValue]) -> list[_Candidate]:
    truncated = _ends_open(values)
    candidates = [_Candidate(text, repairable=not truncated, primary=True)]
    for match in _FENCE_RE.finditer(text):
        closed = match.group("close") is not None
        candidates.append(_Candidate(match.group("body").strip(), repairable=closed or not truncated, primary=True))
    candidates.extend(
        _Candidate(text[value.start : value.end], repairable=True, primary=False)
        for value in values
        if value.end is not None
    )
    seen: set[str] = set()
    unique: list[_Candidate] = []
    for candidate in candidates:
        if candidate.text and candidate.text not in seen:
            seen.add(candidate.text)
            unique.append(candidate)
    return unique


def _object_readings(values: list[ScannedValue]) -> Iterable[list[str]]:
    yield from (value.items for value in values if value.items)
    standalone = [item for value in values if value.kind == "{" and not value.wrapper for item in value.items]
    if len(standalone) > 1:
        yield standalone


def _offer_decoded(selection: _Selection, decoded: Decoded | None, candidate: _Candidate) -> None:
    if decoded is not None:
        selection.offer(_read_value(decoded.value), trusted=decoded.exact, primary=candidate.primary)


def parse_ai_response(raw: str) -> ParseResult:
    """Parse a model's complete answer into comments, per-item errors and an overall error, if any.

    ``json_error`` is set only when nothing usable came out; ``comments_to_store`` then turns the
    answer into a single general comment so that it is not lost.
    """
    visible, reasoning_cut_off = strip_reasoning(raw)
    text = visible.strip()
    if not text:
        reason = "The response is empty" if not raw.strip() else "The response holds nothing but model reasoning"
        return ParseResult(json_error=reason, truncated=reasoning_cut_off, fallback_body=raw.strip())

    values = _scan(text)
    candidates = _text_candidates(text, values)
    budget = RepairBudget()
    selection = _Selection()
    for candidate in candidates:
        _offer_decoded(selection, decode_exact(candidate.text), candidate)
    for objects in _object_readings(values):
        selection.offer(_read_objects(objects, budget), trusted=True, primary=False)
    if not selection.found:
        for candidate in candidates:
            if candidate.repairable:
                _offer_decoded(selection, decode_repaired(candidate.text, budget), candidate)
    return selection.result(text, truncated=reasoning_cut_off or _ends_open(values))
