"""Incremental extraction of review comments from a model's streamed answer.

``StreamingCommentParser`` hands back each comment object the moment its closing brace
arrives, so a client can render comments while the model is still writing. Each character
is looked at once — nothing is rescanned when a new chunk comes in — and the scan is
string- and escape-aware, so braces, brackets and quotes inside a body never shift depth.

The same two building blocks serve the batch parser in ``ai_response_parser``:

* ``ReasoningFilter`` drops ``<think>…</think>`` blocks before anything is scanned;
* ``JsonStructureScanner`` finds the top-level JSON values in free text (prose and markdown
  fences around them are skipped) and cuts the comment objects out of them.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Final

from mr_review.use_cases.reviews._ai_payload import WRAPPER_KEYS, ParsedComment, parse_item_text

_OPEN_TAGS: Final = frozenset({"<think>", "<thinking>"})
_CLOSE_TAGS: Final = frozenset({"</think>", "</thinking>"})
_ALL_TAGS: Final = _OPEN_TAGS | _CLOSE_TAGS
_TAG_PREFIXES: Final = frozenset(tag[:end] for tag in _ALL_TAGS for end in range(1, len(tag) + 1))
_CLOSE_TAG_RE: Final = re.compile(r"</think(?:ing)?>", re.IGNORECASE)
# Characters of reasoning kept between chunks so a closing tag split across them is still found.
_REASONING_TAIL: Final = max(len(tag) for tag in _CLOSE_TAGS) - 1
_LINE_INDENT_RE: Final = re.compile(r"[ \t]*")

_SPACE_RE: Final = re.compile(r"\s*")
_TOP_LEVEL_OPENER_RE: Final = re.compile(r"[\[{]")
_STRUCTURE_RE: Final = re.compile(r"[\[\]{}\"',:“]")
_STRING_STOP_RES: Final = {
    '"': re.compile(r'["\\]'),
    "'": re.compile(r"['\\]"),
    "”": re.compile(r"[”\\]"),
}
# A top-level bracket opens a value only when the next significant character could start a review:
# an array of objects (or an empty one), an object with a quoted key. Prose such as "[3 found]",
# "[link](url)" or "{name}" then never swallows the answer that follows it.
_ARRAY_CONTINUATIONS: Final = frozenset("{]")
_OBJECT_CONTINUATIONS: Final = frozenset("\"'“")
_MAX_KEY_LENGTH: Final = 64


class ReasoningFilter:
    """Removes model reasoning from a text stream.

    A tag counts only at the start of a line (after optional spaces or tabs): a valid JSON
    string cannot hold a raw newline, so a line-anchored tag is never part of a comment body.
    An opening tag hides everything up to the next closing tag, or to the end of the stream
    if it never closes. A closing tag with no opening one — chat templates that put ``<think>``
    into the prompt — hides everything before it.
    """

    def __init__(self) -> None:
        self._in_reasoning = False
        self._line_start = True
        self._head = ""
        self._tail = ""

    def feed(self, chunk: str) -> tuple[str, bool]:
        """Return the visible part of ``chunk`` and whether all text seen before it must be discarded."""
        out: list[str] = []
        discard_before = False
        pos, end = 0, len(chunk)
        while pos < end:
            if self._in_reasoning:
                pos = self._skip_reasoning(chunk, pos)
            elif self._line_start:
                pos, tag = self._read_line_head(chunk, pos, out)
                if tag is not None and tag not in _OPEN_TAGS:
                    out.clear()
                    discard_before = True
            else:
                newline = chunk.find("\n", pos)
                if newline < 0:
                    out.append(chunk[pos:])
                    break
                out.append(chunk[pos : newline + 1])
                pos = newline + 1
                self._line_start = True
        return "".join(out), discard_before

    @property
    def in_reasoning(self) -> bool:
        return self._in_reasoning

    def flush(self) -> str:
        """Release text held back as a possible tag once the stream has ended."""
        head, self._head = self._head, ""
        return "" if self._in_reasoning else head

    def _read_line_head(self, chunk: str, pos: int, out: list[str]) -> tuple[int, str | None]:
        """Consume the start of a line while it may still turn into a tag; return the tag if one completed."""
        end = len(chunk)
        while pos < end:
            if not self._head:
                indent = _LINE_INDENT_RE.match(chunk, pos)
                if indent is not None and indent.end() > pos:
                    out.append(indent.group())
                    pos = indent.end()
                    continue
            candidate = (self._head + chunk[pos]).lower()
            if candidate not in _TAG_PREFIXES:
                out.append(self._head)
                self._head = ""
                self._line_start = False
                return pos, None
            self._head += chunk[pos]
            pos += 1
            if candidate in _ALL_TAGS:
                self._head = ""
                self._line_start = False
                self._in_reasoning = candidate in _OPEN_TAGS
                self._tail = ""
                return pos, candidate
        return pos, None

    def _skip_reasoning(self, chunk: str, pos: int) -> int:
        haystack = self._tail + chunk[pos:]
        match = _CLOSE_TAG_RE.search(haystack)
        if match is None:
            self._tail = haystack[-_REASONING_TAIL:]
            return len(chunk)
        self._in_reasoning = False
        self._line_start = False
        consumed = match.end() - len(self._tail)
        self._tail = ""
        return pos + consumed


def strip_reasoning(text: str) -> tuple[str, bool]:
    """``text`` without reasoning blocks, and whether it ended inside one that never closed.

    The rules are the ones ``ReasoningFilter`` applies to a stream.
    """
    reasoning_filter = ReasoningFilter()
    visible, _ = reasoning_filter.feed(text)
    cut_off = reasoning_filter.in_reasoning
    return visible + reasoning_filter.flush(), cut_off


class _Role(Enum):
    ITEMS = "items"  # an array whose object elements are comments
    WRAPPER = "wrapper"  # an object that may hold the comment array, or be a comment itself
    ITEM = "item"  # a comment object being cut out
    OTHER = "other"  # anything else, tracked only to keep depth


class _Frame:
    __slots__ = ("expect_key", "key", "role", "yielded")

    def __init__(self, role: _Role) -> None:
        self.role = role
        self.expect_key = True
        self.key: str | None = None
        # A wrapper yields once one of its wrapper keys holds an array or another wrapper object.
        self.yielded = False


@dataclass(slots=True)
class ScannedValue:
    """A top-level JSON value found in free text, with the comment objects cut out of it."""

    start: int
    kind: str
    end: int | None = None  # exclusive; None while the value is still open (truncated output)
    wrapper: bool = False  # an object whose comment array sits under a wrapper key
    items: list[str] = field(default_factory=list)


class JsonStructureScanner:
    """String-aware, incremental scanner of the JSON values embedded in a text stream.

    It recognises the shapes the batch parser accepts — a bare array, a wrapper object such as
    ``{"comments": [...]}`` or ``{"review": {"comments": [...]}}``, and standalone comment
    objects one after another (NDJSON) — and returns the text of every comment object as soon
    as it closes. Strings may be double-, single- or smart-quoted; escapes are honoured.
    """

    def __init__(self, *, record_values: bool = False, offset: int = 0) -> None:
        self.values: list[ScannedValue] = []
        self._record = record_values
        # Position of the next chunk in the whole text; recorded values are reported against it.
        self._offset = offset
        self._frames: list[_Frame] = []
        self._string_end: str | None = None
        self._escaped = False
        self._key_parts: list[str] | None = None
        self._key_start = 0
        # A top-level bracket at the very end of a chunk, waiting for the character that decides it.
        self._pending: list[str] | None = None
        self._pending_start = 0
        # Only one object is ever being cut out: a comment, or a wrapper that may turn out to be one.
        self._capture: list[str] | None = None
        self._capture_start = 0

    def reset(self) -> None:
        """Forget all structure seen so far, e.g. when it turns out to have been reasoning."""
        self._frames.clear()
        self._string_end = None
        self._escaped = False
        self._key_parts = None
        self._pending = None
        self._capture = None

    def feed(self, chunk: str) -> list[str]:
        """Scan ``chunk`` and return the text of every comment object that closed in it."""
        items: list[str] = []
        pos, end = 0, len(chunk)
        while pos < end:
            if self._string_end is not None:
                pos = self._scan_string(chunk, pos, self._string_end)
            elif self._pending is not None:
                pos = self._resolve_pending(chunk, pos, self._pending)
            elif not self._frames:
                match = _TOP_LEVEL_OPENER_RE.search(chunk, pos)
                if match is None:
                    break
                pos = self._open_top_level(chunk, match.start())
            else:
                match = _STRUCTURE_RE.search(chunk, pos)
                if match is None:
                    break
                pos = self._structural(chunk, match.start(), items)
        self._carry_over(chunk)
        self._offset += end
        return items

    def _carry_over(self, chunk: str) -> None:
        """Keep the unfinished tails of the capture and of a key for the next chunk."""
        if self._capture is not None:
            self._capture.append(chunk[self._capture_start :])
            self._capture_start = 0
        if self._key_parts is not None:
            self._key_parts.append(chunk[self._key_start :])
            self._key_start = 0
            if sum(len(part) for part in self._key_parts) > _MAX_KEY_LENGTH:
                self._key_parts = None

    def _open_top_level(self, chunk: str, pos: int) -> int:
        following = _SPACE_RE.match(chunk, pos + 1)
        nxt = following.end() if following is not None else pos + 1
        if nxt == len(chunk):
            # Whether this bracket starts JSON is decided by the next significant character.
            self._pending = [chunk[pos:]]
            self._pending_start = self._offset + pos
            return nxt
        if self._continues_json(chunk[pos], chunk[nxt]):
            self._push_top_level(chunk[pos], self._offset + pos, capture_from=pos, carried="")
        return pos + 1

    def _resolve_pending(self, chunk: str, pos: int, pending: list[str]) -> int:
        following = _SPACE_RE.match(chunk, pos)
        nxt = following.end() if following is not None else pos
        if nxt == len(chunk):
            pending.append(chunk[pos:])
            return nxt
        self._pending = None
        opener = pending[0][0]
        if self._continues_json(opener, chunk[nxt]):
            self._push_top_level(opener, self._pending_start, capture_from=pos, carried="".join(pending))
        return nxt

    @staticmethod
    def _continues_json(opener: str, following: str) -> bool:
        allowed = _ARRAY_CONTINUATIONS if opener == "[" else _OBJECT_CONTINUATIONS
        return following in allowed

    def _push_top_level(self, opener: str, start: int, *, capture_from: int, carried: str) -> None:
        """Open a top-level value; an object is captured from ``capture_from`` after the ``carried`` text."""
        self._frames.append(_Frame(_Role.ITEMS if opener == "[" else _Role.WRAPPER))
        if self._record:
            self.values.append(ScannedValue(start=start, kind=opener))
        if opener == "{":
            self._capture = [carried]
            self._capture_start = capture_from

    def _scan_string(self, chunk: str, pos: int, closing: str) -> int:
        end = len(chunk)
        if self._escaped:
            self._escaped = False
            pos += 1
        stop_re = _STRING_STOP_RES[closing]
        while pos < end:
            match = stop_re.search(chunk, pos)
            if match is None:
                return end
            stop = match.start()
            if chunk[stop] == "\\":
                if stop + 1 == end:
                    self._escaped = True
                    return end
                pos = stop + 2
                continue
            self._string_end = None
            self._finish_key(chunk, stop)
            return stop + 1
        return pos

    def _finish_key(self, chunk: str, stop: int) -> None:
        if self._key_parts is None:
            return
        self._key_parts.append(chunk[self._key_start : stop])
        key = "".join(self._key_parts)
        self._key_parts = None
        if len(key) <= _MAX_KEY_LENGTH:
            self._frames[-1].key = key.strip().lower()

    def _structural(self, chunk: str, pos: int, items: list[str]) -> int:
        char = chunk[pos]
        frame = self._frames[-1]
        if char in "\"'“":
            self._string_end = "”" if char == "“" else char
            if frame.role is _Role.WRAPPER and frame.expect_key:
                self._key_parts = []
                self._key_start = pos + 1
        elif char == ":":
            frame.expect_key = False
        elif char == ",":
            frame.expect_key = True
            frame.key = None
        elif char in "[{":
            self._open_nested(char, pos, frame)
        else:
            self._close(chunk, pos, items)
        return pos + 1

    def _open_nested(self, char: str, pos: int, parent: _Frame) -> None:
        role = _Role.OTHER
        if parent.role is _Role.ITEMS and char == "{":
            role = _Role.ITEM
        elif (
            parent.role is _Role.WRAPPER and not parent.expect_key and not parent.yielded and parent.key in WRAPPER_KEYS
        ):
            parent.yielded = True
            self._capture = None
            if self._record and len(self._frames) == 1:
                self.values[-1].wrapper = True
            role = _Role.ITEMS if char == "[" else _Role.WRAPPER
        self._frames.append(_Frame(role))
        if role in (_Role.ITEM, _Role.WRAPPER):
            self._capture = []
            self._capture_start = pos

    def _close(self, chunk: str, pos: int, items: list[str]) -> None:
        # Any closer ends the innermost value: models drop or swap brackets far more often than
        # they nest them deeper, and a stray closer at the top level is simply ignored.
        frame = self._frames.pop()
        if self._capture is not None and (frame.role is _Role.ITEM or frame.role is _Role.WRAPPER):
            self._capture.append(chunk[self._capture_start : pos + 1])
            text = "".join(self._capture)
            self._capture = None
            items.append(text)
            if self._record:
                self.values[-1].items.append(text)
        if not self._frames and self._record:
            self.values[-1].end = self._offset + pos + 1


class StreamingCommentParser:
    """Turns a streamed model answer into review comments as each comment object completes.

    ``feed`` returns the comments whose closing brace arrived in that chunk, normalised exactly
    as ``parse_ai_response`` normalises them. Reasoning blocks and markdown fences are ignored;
    a bare array, a wrapper object and one comment object per line are all understood. For a
    well-formed answer the comments fed out over the stream are the ones the batch parser finds.
    It is a preview: objects only ``json-repair`` could read are left to the final parse.
    """

    def __init__(self) -> None:
        self._reasoning = ReasoningFilter()
        self._scanner = JsonStructureScanner()
        self._items_seen = 0

    def feed(self, chunk: str) -> list[ParsedComment]:
        visible, discard_before = self._reasoning.feed(chunk)
        if discard_before:
            self._scanner.reset()
        if not visible:
            return []
        comments: list[ParsedComment] = []
        for text in self._scanner.feed(visible):
            parsed = parse_item_text(self._items_seen, text, budget=None)
            self._items_seen += 1
            if isinstance(parsed, ParsedComment):
                comments.append(parsed)
        return comments
