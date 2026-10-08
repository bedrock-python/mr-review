"""Decoding and normalisation shared by the batch and the streaming AI response parsers.

A model's answer is untrusted text that is *meant* to hold JSON. This module turns one
JSON-ish fragment into review comments as leniently as is safe:

* ``decode_exact`` — ``json.loads(strict=False)``, then after a light string-aware repair
  (comments, trailing commas, smart or single quotes, bare keys, Python literals);
  ``decode_repaired`` — the ``json-repair`` package, the last resort, within a ``RepairBudget``;
* ``wrapper_candidates`` — a bare array, the arrays a wrapper object holds, or one comment object;
* ``normalize_comment`` — key aliases, severity synonyms, the first integer of a line reference.

Every regular expression here runs in linear time on any input: repetition is possessive or
atomic, and a string or comment that is never closed runs to the end of the text instead of
being tried again from each later position.
"""

from __future__ import annotations

import json
import math
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Final

import json_repair

from mr_review.core.reviews.severity import DEFAULT_SEVERITY, Severity, normalize_severity

# Keys under which a wrapper object may hold the comment array (or a nested wrapper).
WRAPPER_KEYS: Final = frozenset({"comments", "review", "issues", "findings", "items"})

# Accepted spellings of each comment field, in order of preference.
_FILE_KEYS: Final = ("file", "path", "filename", "file_path", "filepath", "file_name")
_LINE_KEYS: Final = ("line", "line_number", "lineno", "start_line", "new_line", "lines")
_BODY_KEYS: Final = ("body", "comment", "message", "text", "description")
_SEVERITY_KEYS: Final = ("severity", "level", "priority")

_FILE_PLACEHOLDERS: Final = frozenset({"null", "none", "n/a", "-"})
_KEY_SEPARATORS_RE: Final = re.compile(r"[\s-]+")
_INT_RE: Final = re.compile(r"-?\d++")
_MAX_LINE_DIGITS: Final = 9
# A line given as a list ("[12, 15]") is read from its first element, through this many levels.
_MAX_LINE_NESTING: Final = 4

# json-repair is quadratic or worse on prose full of brackets (40 KB of it takes most of a minute).
# It is only given text shaped like JSON, in fragments up to this size and this much per parse.
_REPAIR_MAX_CHARS: Final = 8_000
_REPAIR_BUDGET_CHARS: Final = 16_000

# A double-quoted string; one that never closes runs to the end of the text.
_DQ_STRING: Final = r'"[^"\\]*+(?:\\.?[^"\\]*+)*+(?:"|\Z)'
_STRING_TOKEN_RE: Final = re.compile(
    _DQ_STRING + r"|'[^'\\]*+(?:\\.?[^'\\]*+)*+(?:'|\Z)" + r"|“[^”]*+(?:”|\Z)",
    re.DOTALL,
)

# First pass of the light repair. JSON strings are kept verbatim, so nothing inside a body is
# touched; single- and smart-quoted strings are re-quoted; comments are dropped; bare keys get
# quotes; Python's True/False/None become JSON literals. Anything left unclosed is kept as is.
_LIGHT_REPAIR_RE: Final = re.compile(
    rf"(?P<string>{_DQ_STRING})"
    r"|'(?P<single>[^'\\]*+(?:\\.?[^'\\]*+)*+)(?P<single_end>'|\Z)"
    r"|“(?P<smart>[^”\"]*+)(?P<smart_end>[”\"]|\Z)"
    r"|(?P<comment>//[^\n]*+|/\*(?>.*?\*/))"
    r"|(?P<open_comment>/\*.*+)"
    r"|(?<![\w-])(?P<key>[A-Za-z_][\w-]*+)(?=\s*+:)"
    r"|(?<![\w-])(?P<literal>True|False|None)(?![\w-])",
    re.DOTALL,
)
# Second pass, once comments are gone: a comma right before a closer.
_TRAILING_COMMA_RE: Final = re.compile(rf"(?P<string>{_DQ_STRING})|,(?=\s*+[\]}}])", re.DOTALL)
_PYTHON_LITERALS: Final = {"True": "true", "False": "false", "None": "null"}
_UNESCAPED_QUOTE_RE: Final = re.compile(r'(?<!\\)"')


@dataclass(frozen=True, slots=True)
class ParsedComment:
    """A review comment recovered from model output, before it is given an id."""

    file: str | None
    line: int | None
    severity: Severity
    body: str


@dataclass
class CommentParseError:
    index: int
    raw: object
    reason: str


class RepairBudget:
    """How much more text one parse may hand to json-repair."""

    def __init__(self, total: int = _REPAIR_BUDGET_CHARS) -> None:
        self._left = total

    def allows(self, size: int) -> bool:
        return size <= _REPAIR_MAX_CHARS and size <= self._left

    def take(self, size: int) -> None:
        self._left -= size


def _shaped_like_json(text: str) -> bool:
    """Whether ``text`` opens and closes like a JSON value and has a string for every nested value.

    Broken JSON — stray quotes inside a body, missing commas, bare keys — passes and repairs in
    linear time; prose wrapped in brackets, the input json-repair chokes on, does not.
    """
    stripped = text.strip()
    if not stripped or stripped[0] not in "[{" or stripped[-1] not in "]}":
        return False
    strings = len(_STRING_TOKEN_RE.findall(stripped))
    outside = _STRING_TOKEN_RE.sub("", stripped)
    return outside.count("[") + outside.count("{") <= strings + 1


@dataclass(frozen=True, slots=True)
class Decoded:
    value: object
    # True when ``json.loads`` accepted the text as-is or after the light repair. ``json-repair``
    # turns almost any text into *some* value, so its output is trusted only when it yields comments.
    exact: bool


def _requote(content: str) -> str:
    """A single- or smart-quoted string's content as a JSON string."""
    return '"' + _UNESCAPED_QUOTE_RE.sub(r'\\"', content.replace("\\'", "'")) + '"'


def _light_repair_token(match: re.Match[str]) -> str:
    kind = match.lastgroup
    if kind in ("single_end", "smart_end"):
        # A quoted string; an unclosed one (empty end) is left alone.
        content = match.group(kind.removesuffix("_end"))
        return _requote(content) if match.group(kind) else match.group()
    if kind == "key":
        return f'"{match.group(kind)}"'
    if kind == "literal":
        return _PYTHON_LITERALS[match.group(kind)]
    if kind == "comment":
        return ""
    return match.group()


def _trailing_comma_token(match: re.Match[str]) -> str:
    return match.group("string") or ""


def _light_repair(text: str) -> str:
    return _TRAILING_COMMA_RE.sub(_trailing_comma_token, _LIGHT_REPAIR_RE.sub(_light_repair_token, text))


def _loads(text: str) -> object:
    """``json.loads`` that tolerates raw control characters (literal newlines, tabs) inside strings."""
    return json.loads(text, strict=False)


def decode_exact(text: str) -> Decoded | None:
    """``json.loads`` on ``text`` as-is, then after the light repair; ``None`` if both fail."""
    try:
        return Decoded(_loads(text), exact=True)
    except (ValueError, RecursionError):
        pass
    repaired = _light_repair(text)
    if repaired == text:
        return None
    try:
        return Decoded(_loads(repaired), exact=True)
    except (ValueError, RecursionError):
        return None


def decode_repaired(text: str, budget: RepairBudget) -> Decoded | None:
    """The ``json-repair`` reading of ``text`` when it is a non-empty array or object."""
    if not budget.allows(len(text)) or not _shaped_like_json(text):
        return None
    budget.take(len(text))
    try:
        value = json_repair.loads(text, skip_json_loads=True)
    except Exception:  # a best-effort heuristic: any failure only means "not repairable"
        return None
    if isinstance(value, (list, dict)) and value:
        return Decoded(value, exact=False)
    return None


_Container = list[object] | dict[object, object]


def _wrapped_values(obj: dict[object, object]) -> list[_Container]:
    wrapped: list[_Container] = []
    for key, inner in obj.items():
        if isinstance(key, str) and key.strip().lower() in WRAPPER_KEYS and isinstance(inner, (list, dict)):
            wrapped.append(inner)
    return wrapped


def wrapper_candidates(value: object) -> list[tuple[list[object], bool]] | None:
    """The item lists a decoded value may hold its comments in, each with whether it is an array.

    A bare array is its own single candidate. An object offers what every wrapper key holds, in
    document order — an array as it is, a nested object by the same rule — or, with no wrapper
    key at all, itself as a single comment. ``None`` for any other value.
    """
    if isinstance(value, list):
        return [(value, True)]
    if not isinstance(value, dict):
        return None
    candidates: list[tuple[list[object], bool]] = []
    # Depth-first in document order, without recursion: nesting depth is up to the model.
    pending: list[_Container] = [value]
    while pending:
        current = pending.pop()
        if isinstance(current, list):
            candidates.append((current, True))
            continue
        nested = _wrapped_values(current)
        if nested:
            pending.extend(reversed(nested))
        else:
            candidates.append(([current], False))
    return candidates


def _normalize_key(key: str) -> str:
    return _KEY_SEPARATORS_RE.sub("_", key.strip().lower())


def _coerce_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text or None


def _coerce_file(value: object) -> str | None:
    text = _coerce_text(value)
    if text is None:
        return None
    path = text.strip("`'\"").strip()
    if not path or path.lower() in _FILE_PLACEHOLDERS:
        return None
    return path


def _first_int(text: str) -> int | None:
    match = _INT_RE.search(text)
    if match is None or len(match.group().lstrip("-")) > _MAX_LINE_DIGITS:
        return None
    return int(match.group())


def _first_element(value: object) -> object:
    """The first scalar of a list such as ``[12, 15]``, through a few levels; ``None`` past that."""
    for _ in range(_MAX_LINE_NESTING):
        if not isinstance(value, list):
            return value
        if not value:
            return None
        value = value[0]
    return None if isinstance(value, list) else value


def _line_number(value: object) -> int | None:
    value = _first_element(value)
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if math.isfinite(value) else None
    if isinstance(value, str):
        return _first_int(value)
    return None


def _coerce_line(value: object) -> int | None:
    """The first integer of a line reference: 42, "L42", "42:5" and "12-15" give 42, 42, 42 and 12."""
    number = _line_number(value)
    return number if number is not None and number > 0 else None


def _first_value[T](fields: dict[str, object], keys: tuple[str, ...], coerce: Callable[[object], T | None]) -> T | None:
    """The first alias, in order of preference, whose value survives ``coerce``."""
    for key in keys:
        if key in fields:
            coerced = coerce(fields[key])
            if coerced is not None:
                return coerced
    return None


def normalize_comment(index: int, item: object) -> ParsedComment | CommentParseError:
    """Validate one comment candidate, mapping key aliases and severity synonyms onto the schema."""
    if not isinstance(item, dict):
        return CommentParseError(index=index, raw=item, reason=f"Expected object, got {type(item).__name__}")

    fields = {_normalize_key(k): v for k, v in item.items() if isinstance(k, str)}
    body = _first_value(fields, _BODY_KEYS, _coerce_text)
    if body is None:
        return CommentParseError(index=index, raw=item, reason="Missing or empty 'body' field")

    return ParsedComment(
        file=_first_value(fields, _FILE_KEYS, _coerce_file),
        line=_first_value(fields, _LINE_KEYS, _coerce_line),
        severity=_first_value(fields, _SEVERITY_KEYS, normalize_severity) or DEFAULT_SEVERITY,
        body=body,
    )


def parse_item_text(index: int, text: str, budget: RepairBudget | None) -> ParsedComment | CommentParseError:
    """Decode and normalise the text of one comment object cut out of a larger response.

    Without a ``budget`` json-repair is not tried at all — the streaming preview runs on the event
    loop and must stay linear; the final parse repairs what the preview could not read.
    """
    decoded = decode_exact(text)
    if decoded is None and budget is not None:
        decoded = decode_repaired(text, budget)
    if decoded is None:
        return CommentParseError(index=index, raw=text, reason="Invalid JSON object")
    return normalize_comment(index, decoded.value)
