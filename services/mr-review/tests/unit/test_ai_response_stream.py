"""Unit tests for the incremental comment parser and the reasoning filter behind it."""

from __future__ import annotations

import json
import random
import time
from collections.abc import Callable

import pytest
from mr_review.use_cases.reviews.ai_response_parser import ParsedComment, parse_ai_response
from mr_review.use_cases.reviews.ai_response_stream import ReasoningFilter, StreamingCommentParser

pytestmark = pytest.mark.unit

Row = tuple[str | None, int | None, str, str]

_TRICKY_BODIES = [
    "Plain body",
    'Quotes "inside" and a backslash \\ here',
    "Braces { } and brackets [ ] that do not balance: ]] {{",
    "A fence:\n```python\ndef f(x):\n    return {x: [x]}\n```\nend",
    "Escaped unicode é and an emoji 🙂 and Кириллица",
    "Mentions <think> and </think> mid-line",
    "Trailing backslash \\",
    "Tab\tand newline\nand carriage return\r",
]
_SEVERITIES = ["critical", "major", "minor", "suggestion"]


def _rows(comments: list[ParsedComment]) -> list[Row]:
    return [(c.file, c.line, c.severity, c.body) for c in comments]


def _feed_in_pieces(raw: str, split: Callable[[str], list[str]]) -> list[ParsedComment]:
    parser = StreamingCommentParser()
    comments: list[ParsedComment] = []
    for piece in split(raw):
        comments.extend(parser.feed(piece))
    return comments


def _char_by_char(raw: str) -> list[str]:
    return list(raw)


def _random_splitter(seed: int) -> Callable[[str], list[str]]:
    rng = random.Random(seed)

    def split(raw: str) -> list[str]:
        pieces: list[str] = []
        pos = 0
        while pos < len(raw):
            step = rng.randint(1, 24)
            pieces.append(raw[pos : pos + step])
            pos += step
        return pieces

    return split


def _random_items(rng: random.Random) -> list[dict[str, object]]:
    return [
        {
            "file": f"src/module_{i}.py",
            "line": rng.randint(1, 500),
            "severity": rng.choice(_SEVERITIES),
            "body": rng.choice(_TRICKY_BODIES) + f" #{i}",
        }
        for i in range(rng.randint(1, 6))
    ]


def _shape(rng: random.Random, items: list[dict[str, object]]) -> str:
    """One well-formed answer in a randomly chosen shape a model might use."""
    indent = rng.choice([None, 2])
    array = json.dumps(items, indent=indent, ensure_ascii=rng.random() < 0.5)
    shapes = [
        array,
        f"Here is the review [{len(items)} found]:\n```json\n{array}\n```\nHope it helps.",
        json.dumps({"summary": "see below", "comments": items}, indent=indent),
        json.dumps({"review": {"verdict": "changes", "issues": items}}),
        "\n".join(json.dumps(item) for item in items),
        '<think>\nComparing [old] and {new}; draft: [{"body": "draft"}]\n</think>\n' + array,
    ]
    return rng.choice(shapes)


_GENERATED = [_shape(rng, _random_items(rng)) for rng in (random.Random(seed) for seed in range(40))]


@pytest.mark.parametrize("raw", _GENERATED, ids=[f"answer{i}" for i in range(len(_GENERATED))])
@pytest.mark.parametrize(
    "split",
    [_char_by_char, _random_splitter(1), _random_splitter(2), lambda raw: [raw]],
    ids=["char_by_char", "random_split_1", "random_split_2", "whole"],
)
def test__streaming_parser__well_formed_answer__emits_what_the_batch_parser_finds(
    raw: str, split: Callable[[str], list[str]]
) -> None:
    expected = [(c.file, c.line, c.severity, c.body) for c in parse_ai_response(raw).comments]

    assert expected
    assert _rows(_feed_in_pieces(raw, split)) == expected


def test__streaming_parser__object_closes__emitted_before_the_array_ends() -> None:
    parser = StreamingCommentParser()

    first = parser.feed('[{"file": "a.py", "line": 1, "body": "One"}')
    pending = parser.feed(', {"file": "b.py", "body": "Tw')
    second = parser.feed('o"}')
    tail = parser.feed("]")

    assert _rows(first) == [("a.py", 1, "suggestion", "One")]
    assert pending == []
    assert _rows(second) == [("b.py", None, "suggestion", "Two")]
    assert tail == []


def test__streaming_parser__escape_split_across_chunks__escaped_quote_stays_in_the_string() -> None:
    parser = StreamingCommentParser()

    first = parser.feed('[{"body": "quote \\')
    second = parser.feed('"} still inside"}')

    assert first == []
    assert [c.body for c in second] == ['quote "} still inside']


def test__streaming_parser__brackets_inside_strings__do_not_shift_depth() -> None:
    raw = json.dumps([{"body": "}]} not the end [{"}, {"body": "second"}])

    comments = _feed_in_pieces(raw, _char_by_char)

    assert [c.body for c in comments] == ["}]} not the end [{", "second"]


def test__streaming_parser__normalises_fields_like_the_batch_parser() -> None:
    raw = json.dumps([{"path": "a.py", "line_number": "L12-14", "message": "Alias", "level": "HIGH"}])

    assert _rows(_feed_in_pieces(raw, _char_by_char)) == [("a.py", 12, "major", "Alias")]


def test__streaming_parser__truncated_answer__only_complete_objects() -> None:
    raw = '[{"body": "One"}, {"body": "Two"}, {"body": "Thr'

    assert [c.body for c in _feed_in_pieces(raw, _char_by_char)] == ["One", "Two"]


def test__streaming_parser__reasoning_with_brackets__ignored() -> None:
    raw = '<think>\n[{"body": "draft"}] and {"body": "another draft"}\n</think>\n[{"body": "real"}]'

    assert [c.body for c in _feed_in_pieces(raw, _char_by_char)] == ["real"]


def test__streaming_parser__unterminated_reasoning__emits_nothing() -> None:
    raw = '<think>\n[{"body": "draft"}] and the model ran out of tokens'

    assert _feed_in_pieces(raw, _char_by_char) == []


def test__streaming_parser__object_without_body__skipped() -> None:
    raw = '[{"file": "a.py"}, {"body": "kept"}]'

    assert [c.body for c in _feed_in_pieces(raw, _random_splitter(3))] == ["kept"]


def test__streaming_parser__long_answer_fed_char_by_char__stays_linear() -> None:
    items = [{"file": f"f{i}.py", "line": i, "body": 'x {["]} ' * 40} for i in range(300)]
    raw = "```json\n" + json.dumps(items, indent=2) + "\n```"
    parser = StreamingCommentParser()
    started = time.perf_counter()

    emitted = sum(len(parser.feed(char)) for char in raw)

    # Hundreds of kilobytes; a parser that rescanned from the start per chunk would take minutes.
    assert time.perf_counter() - started < 10
    assert emitted == 300


# ── ReasoningFilter ───────────────────────────────────────────────────────────


def _filter_all(pieces: list[str]) -> str:
    reasoning_filter = ReasoningFilter()
    out: list[str] = []
    for piece in pieces:
        visible, discard_before = reasoning_filter.feed(piece)
        if discard_before:
            out.clear()
        out.append(visible)
    out.append(reasoning_filter.flush())
    return "".join(out)


@pytest.mark.parametrize(
    "pieces",
    [
        ["<think>a [b]</think>[1]"],
        ["<thi", "nk>a [b]</th", "ink>[1]"],
        list("<think>a [b]</think>[1]"),
        ["  <THINK>\na\n</Think>", "[1]"],
        ["<thinking>a</thinking>[1]"],
    ],
    ids=["whole", "tags_split", "char_by_char", "indented_any_case", "thinking"],
)
def test__reasoning_filter__leading_block__removed(pieces: list[str]) -> None:
    assert _filter_all(pieces).strip() == "[1]"


def test__reasoning_filter__orphan_closing_tag__discards_everything_before_it() -> None:
    assert _filter_all(["draft [1]\n", "</think>\n", "[2]"]).strip() == "[2]"


def test__reasoning_filter__tag_mid_line__kept_as_text() -> None:
    text = '[{"body": "see <think> and </think> here"}]'

    assert _filter_all(list(text)) == text


def test__reasoning_filter__line_starting_with_angle_bracket__released_unchanged() -> None:
    text = "<thin ice>\n<b>bold</b>\n["

    assert _filter_all(list(text)) == text
