"""Turning a model's complete answer into review comments.

Models are asked for a bare JSON array and mostly, not always, comply. The answer is treated as
text with JSON somewhere in it, read in this order of trust:

1. the whole answer, reasoning blocks removed, when it is JSON as it stands;
2. the answer proper: every markdown fence, and the JSON values the answer opens with. A fence
   counts only at the start of a line — one inside a comment body sits mid-line, as a JSON string
   cannot hold a raw newline. Comments split across several fences or values are merged;
3. only when there is no such answer, every JSON value found anywhere in the prose, merged.

A value is read as a whole with ``json.loads(strict=False)``, then after a light repair; failing
that, the comment objects are cut out of it one at a time, which also keeps every complete
comment of an array cut off by the model's token limit; ``json-repair`` is the last resort, within
a size budget. Only the answer proper may say "no findings" with an empty array: an ``[]`` or an
example quoted in prose never outweighs it.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Final
from uuid import uuid4

from mr_review.core.reviews.entities import Comment
from mr_review.use_cases.reviews._ai_payload import (
    CommentParseError,
    ParsedComment,
    RepairBudget,
    decode_exact,
    decode_repaired,
    normalize_comment,
    parse_item_text,
    wrapper_candidates,
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
    r"^[ \t]*+(?P<fence>`{3,}+|~{3,}+)[^\n]*+\n(?P<body>.*?)(?:(?P<close>^[ \t]*+(?P=fence)[ \t]*+$)|\Z)",
    re.MULTILINE | re.DOTALL,
)


@dataclass
class ParseResult:
    comments: list[Comment] = field(default_factory=list)
    errors: list[CommentParseError] = field(default_factory=list)
    json_error: str | None = None
    # The answer stops inside the JSON it consists of, or inside a reasoning block: the model most
    # likely ran into its output token limit. Complete comments before the cut are in ``comments``.
    truncated: bool = False
    # The answer without reasoning, kept as one general comment when nothing could be parsed.
    fallback_body: str = ""

    def comments_to_store(self) -> list[Comment]:
        """The parsed comments or, when nothing parsed, one general comment so the answer is never lost."""
        if self.json_error is None or not self.fallback_body:
            return list(self.comments)
        return [Comment(id=uuid4(), file=None, line=None, severity="suggestion", body=self.fallback_body)]


@dataclass
class _Reading:
    comments: list[ParsedComment] = field(default_factory=list)
    errors: list[CommentParseError] = field(default_factory=list)
    # True when the items came out of a JSON array, so that an empty reading means "no findings".
    from_array: bool = True
    # Decoded exactly rather than salvaged or repaired: only then may it say "empty" or "rejected".
    trusted: bool = True

    def add(self, parsed: ParsedComment | CommentParseError) -> None:
        if isinstance(parsed, ParsedComment):
            self.comments.append(parsed)
        else:
            self.errors.append(parsed)

    @property
    def size(self) -> int:
        return len(self.comments) + len(self.errors)

    @property
    def clean_empty(self) -> bool:
        return self.trusted and self.from_array and self.size == 0


def _to_comment(parsed: ParsedComment) -> Comment:
    return Comment(id=uuid4(), file=parsed.file, line=parsed.line, severity=parsed.severity, body=parsed.body)


def _describe_failure(text: str) -> str:
    try:
        value = json.loads(text, strict=False)
    except (ValueError, RecursionError) as exc:
        return f"Invalid JSON: {exc}"
    return f"Expected a JSON array of comments, got {type(value).__name__}"


def _merge(readings: list[_Reading]) -> _Reading:
    """One reading out of several, in order; a comment repeated word for word is kept once."""
    merged = _Reading()
    seen: set[ParsedComment] = set()
    offset = 0
    for reading in readings:
        for comment in reading.comments:
            if comment not in seen:
                seen.add(comment)
                merged.comments.append(comment)
        merged.errors.extend(
            CommentParseError(index=error.index + offset, raw=error.raw, reason=error.reason)
            for error in reading.errors
        )
        offset += reading.size
    return merged


def _conclude(text: str, readings: list[_Reading], *, truncated: bool) -> ParseResult:
    with_comments = [reading for reading in readings if reading.comments]
    if with_comments:
        merged = _merge(with_comments)
        comments = [_to_comment(c) for c in merged.comments]
        return ParseResult(comments=comments, errors=merged.errors, truncated=truncated)
    if any(reading.clean_empty for reading in readings):
        return ParseResult(truncated=truncated)
    rejected = _merge([reading for reading in readings if reading.trusted and reading.errors])
    if rejected.errors:
        errors = rejected.errors
        reason = f"No usable review comments: {len(errors)} item(s) rejected, e.g. {errors[0].reason}"
        return ParseResult(errors=errors, json_error=reason, truncated=truncated, fallback_body=text)
    return ParseResult(json_error=_describe_failure(text), truncated=truncated, fallback_body=text)


def _read_items(items: list[object], *, from_array: bool, trusted: bool) -> _Reading:
    reading = _Reading(from_array=from_array, trusted=trusted)
    for index, item in enumerate(items):
        reading.add(normalize_comment(index, item))
    return reading


def _read_value(value: object, *, trusted: bool) -> _Reading | None:
    """A decoded value as a review: the wrapper arrays that hold comments, else the first array."""
    candidates = wrapper_candidates(value)
    if candidates is None:
        return None
    readings = [_read_items(items, from_array=is_array, trusted=trusted) for items, is_array in candidates]
    with_comments = [reading for reading in readings if reading.comments]
    if with_comments:
        merged = _merge(with_comments)
        merged.trusted = trusted
        return merged
    return next((reading for reading in readings if reading.from_array), readings[0])


def _read_objects(texts: list[str], budget: RepairBudget) -> _Reading:
    reading = _Reading(trusted=False)
    for index, text in enumerate(texts):
        reading.add(parse_item_text(index, text, budget))
    return reading


class _Answer:
    """The top-level JSON values of one text, each read once and on demand."""

    def __init__(self, text: str, budget: RepairBudget) -> None:
        self.text = text
        self.values = _scan(text)
        self._budget = budget
        self._readings: dict[int, _Reading | None] = {}

    def reading(self, index: int) -> _Reading | None:
        if index not in self._readings:
            self._readings[index] = self._read(self.values[index])
        return self._readings[index]

    def _read(self, value: ScannedValue) -> _Reading | None:
        span = self.text[value.start : value.end]
        if value.end is not None:
            decoded = decode_exact(span)
            reading = _read_value(decoded.value, trusted=True) if decoded is not None else None
            if reading is not None:
                return reading
        if value.items:
            salvaged = _read_objects(value.items, self._budget)
            if salvaged.comments:
                return salvaged
        if value.end is not None:
            repaired = decode_repaired(span, self._budget)
            reading = _read_value(repaired.value, trusted=False) if repaired is not None else None
            if reading is not None and reading.comments:
                return reading
        return None

    def leading_run(self) -> list[int]:
        """The values the text opens with, one after another with nothing but whitespace between."""
        run: list[int] = []
        cursor = 0
        for index, value in enumerate(self.values):
            if value.abandoned or value.start < cursor or self.text[cursor : value.start].strip():
                break
            run.append(index)
            if value.end is None:
                break
            cursor = value.end
        return run

    def ends_open(self, indexes: list[int]) -> bool:
        return any(self.values[index].runs_to_end for index in indexes)


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
        if not scanner.values or not scanner.values[-1].runs_to_end:
            break
        start = scanner.values[-1].start + 1
    return values


def _read_fence(body: str, budget: RepairBudget) -> tuple[list[_Reading], bool]:
    """A fence's readings — the body as one value, else every value in it — and whether it ends open."""
    decoded = decode_exact(body)
    reading = _read_value(decoded.value, trusted=True) if decoded is not None else None
    if reading is not None:
        return [reading], False
    answer = _Answer(body, budget)
    indexes = list(range(len(answer.values)))
    readings = [r for index in indexes if (r := answer.reading(index)) is not None]
    return readings, answer.ends_open(indexes[-1:])


def _primary_readings(answer: _Answer, budget: RepairBudget) -> tuple[list[_Reading], bool]:
    """The answer proper — fences and the values the text opens with — and whether it ends open."""
    readings: list[_Reading] = []
    ends_open = False
    run = answer.leading_run()
    readings.extend(r for index in run if (r := answer.reading(index)) is not None)
    ends_open = answer.ends_open(run)
    for match in _FENCE_RE.finditer(answer.text):
        fence_readings, fence_open = _read_fence(match.group("body"), budget)
        readings.extend(fence_readings)
        ends_open = ends_open or (fence_open and match.group("close") is None)
    return readings, ends_open


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

    whole = decode_exact(text)
    reading = _read_value(whole.value, trusted=True) if whole is not None else None
    if reading is not None:
        return _conclude(text, [reading], truncated=reasoning_cut_off)

    budget = RepairBudget()
    answer = _Answer(text, budget)
    primary, primary_open = _primary_readings(answer, budget)
    if primary:
        return _conclude(text, primary, truncated=reasoning_cut_off or primary_open)

    # No answer proper: whatever comments the prose carries, merged.
    indexes = [index for index in range(len(answer.values)) if (r := answer.reading(index)) and r.comments]
    secondary = [r for index in indexes if (r := answer.reading(index)) is not None]
    return _conclude(text, secondary, truncated=reasoning_cut_off or answer.ends_open(indexes))
