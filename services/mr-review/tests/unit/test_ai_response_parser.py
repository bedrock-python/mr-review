"""Unit tests for the batch AI response parser: a corpus of real-world answer shapes."""

from __future__ import annotations

import json
import time

import pytest
from mr_review.core.reviews.severity import normalize_severity
from mr_review.use_cases.reviews.ai_response_parser import ParseResult, parse_ai_response

pytestmark = pytest.mark.unit

Row = tuple[str | None, int | None, str, str]


def _rows(result: ParseResult) -> list[Row]:
    return [(c.file, c.line, c.severity, c.body) for c in result.comments]


def _array(*items: dict[str, object]) -> str:
    return json.dumps(list(items))


_TWO = _array(
    {"file": "src/a.py", "line": 3, "severity": "major", "body": "First"},
    {"file": "src/b.py", "line": 7, "severity": "minor", "body": "Second"},
)
_TWO_ROWS: list[Row] = [("src/a.py", 3, "major", "First"), ("src/b.py", 7, "minor", "Second")]

_CORPUS: dict[str, tuple[str, list[Row]]] = {
    "bare_array": (_TWO, _TWO_ROWS),
    "fence_with_code_blocks_inside_bodies": (
        "```json\n"
        + _array(
            {"file": "a.py", "line": 1, "severity": "major", "body": "Use:\n```python\nx = 1\n```\nnot y"},
            {"file": "b.py", "line": 2, "severity": "minor", "body": "Also ```inline``` fences"},
        )
        + "\n```",
        [
            ("a.py", 1, "major", "Use:\n```python\nx = 1\n```\nnot y"),
            ("b.py", 2, "minor", "Also ```inline``` fences"),
        ],
    ),
    "fence_with_prose_around": (
        "Here is my review of the change.\n\n```json\n" + _TWO + "\n```\n\nLet me know if you need more.",
        _TWO_ROWS,
    ),
    "fence_with_crlf_line_endings": ("```json\r\n" + _TWO + "\r\n```\r\n", _TWO_ROWS),
    "think_block_with_brackets_and_a_draft": (
        '<think>\nThe diff touches [3 files]; {maybe} a draft: [{"file": "draft.py", "body": "draft"}]\n</think>\n'
        + _TWO,
        _TWO_ROWS,
    ),
    "thinking_block": ("<thinking>\nweighing [a] against {b}\n</thinking>\n\n" + _TWO, _TWO_ROWS),
    "closing_tag_without_opening_tag": ("reasoning about [x] and {y}\n</think>\n\n" + _TWO, _TWO_ROWS),
    "prose_preamble_with_brackets": ("Here are the issues [3 found]:\n" + _TWO + "\nThat's all.", _TWO_ROWS),
    "markdown_links_before_array": ("See [the docs](https://example.com) and {name}.\n" + _TWO, _TWO_ROWS),
    "unclosed_bracket_in_preamble": ('Notes [{"todo": 1, unfinished thought:\n' + _TWO, _TWO_ROWS),
    "trailing_commas": (
        '[{"file": "a.py", "line": 1, "body": "One",}, {"body": "Two",},]',
        [("a.py", 1, "suggestion", "One"), (None, None, "suggestion", "Two")],
    ),
    "smart_quotes": (
        "[{“file”: “a.py”, “body”: “Smart quotes”}]",
        [("a.py", None, "suggestion", "Smart quotes")],
    ),
    "raw_newlines_and_tabs_in_strings": (
        '[{"file": "a.py", "body": "Line one\nLine two\n\tindented"}]',
        [("a.py", None, "suggestion", "Line one\nLine two\n\tindented")],
    ),
    "python_dict_single_quotes": (
        "[{'file': 'a.py', 'line': 3, 'severity': 'High', 'body': 'Say \"hi\", it\\'s [fine]', 'ok': True}]",
        [("a.py", 3, "major", 'Say "hi", it\'s [fine]')],
    ),
    "bare_keys": (
        '[{file: "a.py", line: 4, body: "Bare keys"}]',
        [("a.py", 4, "suggestion", "Bare keys")],
    ),
    "js_comments": (
        '[\n  // the first one\n  {"file": "a.py", "body": "Commented"}, /* trailing */\n]',
        [("a.py", None, "suggestion", "Commented")],
    ),
    "missing_comma_between_objects": (
        '[{"file": "a.py", "body": "One"} {"file": "b.py", "body": "Two"}]',
        [("a.py", None, "suggestion", "One"), ("b.py", None, "suggestion", "Two")],
    ),
    "unescaped_quotes_inside_a_body": (
        '[{"file": "a.py", "body": "Rename "foo" to "bar""}]',
        [("a.py", None, "suggestion", 'Rename "foo" to "bar"')],
    ),
    "truncated_mid_object": (
        '[{"file": "a.py", "body": "One"}, {"file": "b.py", "body": "Two"}, {"file": "c.py", "body": "Thr',
        [("a.py", None, "suggestion", "One"), ("b.py", None, "suggestion", "Two")],
    ),
    "wrapper_comments": ('{"summary": "ok", "comments": ' + _TWO + "}", _TWO_ROWS),
    "wrapper_issues": ('{"issues": ' + _TWO + "}", _TWO_ROWS),
    "wrapper_findings": ('{"Findings": ' + _TWO + "}", _TWO_ROWS),
    "wrapper_items": ('{"items": ' + _TWO + "}", _TWO_ROWS),
    "nested_review_wrapper": ('{"review": {"verdict": "changes", "comments": ' + _TWO + "}}", _TWO_ROWS),
    "wrapper_key_with_a_string_first": ('{"review": "LGTM overall", "comments": ' + _TWO + "}", _TWO_ROWS),
    "single_comment_object": (
        '{"file": "a.py", "line": "L42", "severity": "nit", "body": "Single"}',
        [("a.py", 42, "suggestion", "Single")],
    ),
    "ndjson": (
        '{"file": "a.py", "body": "One"}\n{"file": "b.py", "body": "Two"}\n{"file": "c.py", "body": "Three"}\n',
        [
            ("a.py", None, "suggestion", "One"),
            ("b.py", None, "suggestion", "Two"),
            ("c.py", None, "suggestion", "Three"),
        ],
    ),
    "key_aliases": (
        _array(
            {"path": "a.py", "line_number": "12-15", "message": "Via message", "level": "BLOCKER"},
            {"filename": "b.py", "start_line": 8, "comment": "Via comment", "priority": "low"},
            {"file_path": "c.py", "new_line": 9, "text": "Via text"},
            {"File": "d.py", "Line Number": 10, "description": "Via description", "Severity": "Warning"},
        ),
        [
            ("a.py", 12, "critical", "Via message"),
            ("b.py", 8, "suggestion", "Via comment"),
            ("c.py", 9, "suggestion", "Via text"),
            ("d.py", 10, "minor", "Via description"),
        ],
    ),
    "unicode_bodies": (
        _array({"file": "a.py", "body": "Переименуй переменную 🙂"}),
        [("a.py", None, "suggestion", "Переименуй переменную 🙂")],
    ),
}


@pytest.mark.parametrize(("raw", "expected"), list(_CORPUS.values()), ids=list(_CORPUS))
def test__parse_ai_response__corpus__recovers_every_complete_comment(raw: str, expected: list[Row]) -> None:
    result = parse_ai_response(raw)

    assert _rows(result) == expected
    assert result.json_error is None


@pytest.mark.parametrize(
    "raw",
    ["[]", "```json\n[]\n```", '{"comments": []}', "<think>\nnothing [here]\n</think>\n[]"],
    ids=["bare", "fenced", "wrapper", "after_reasoning"],
)
def test__parse_ai_response__empty_array__is_a_clean_empty_review(raw: str) -> None:
    result = parse_ai_response(raw)

    assert result.comments == []
    assert result.errors == []
    assert result.json_error is None
    assert result.comments_to_store() == []


@pytest.mark.parametrize(
    "raw",
    [
        "LGTM, no issues found.",
        "The function returns [] when the list is empty, which hides the error.",
        "See [1] and {name} — nothing to add.",
    ],
    ids=["plain_prose", "prose_quoting_an_empty_array", "prose_with_brackets"],
)
def test__parse_ai_response__prose__reports_json_error_and_keeps_the_text(raw: str) -> None:
    result = parse_ai_response(raw)

    assert result.comments == []
    assert result.json_error is not None
    stored = result.comments_to_store()
    assert len(stored) == 1
    assert stored[0].body == raw
    assert stored[0].file is None
    assert stored[0].line is None
    assert stored[0].severity == "suggestion"


def test__parse_ai_response__garbage_after_reasoning__fallback_omits_the_reasoning() -> None:
    result = parse_ai_response("<think>\nlong reasoning\n</think>\nSorry, I cannot review this.")

    assert result.json_error is not None
    assert [c.body for c in result.comments_to_store()] == ["Sorry, I cannot review this."]


def test__parse_ai_response__empty_response__json_error_without_a_fallback_comment() -> None:
    result = parse_ai_response("   \n")

    assert result.json_error == "The response is empty"
    assert result.comments_to_store() == []


def test__parse_ai_response__unterminated_reasoning__truncated_and_reasoning_kept_as_fallback() -> None:
    raw = "<think>\nStill weighing [a] against {b} when the tokens ran out"

    result = parse_ai_response(raw)

    assert result.json_error is not None
    assert result.truncated is True
    assert [c.body for c in result.comments_to_store()] == [raw]


def test__parse_ai_response__truncated_array__flags_truncation_and_keeps_complete_comments() -> None:
    result = parse_ai_response(_TWO[:-1] + ', {"file": "c.py", "body": "cut o')

    assert result.truncated is True
    assert result.json_error is None
    assert _rows(result) == _TWO_ROWS


def test__parse_ai_response__complete_answer__not_truncated() -> None:
    assert parse_ai_response(_TWO).truncated is False


def test__parse_ai_response__items_without_body__reported_per_item() -> None:
    raw = _array({"file": "a.py", "line": 1}, {"file": "b.py", "body": "Kept"}, {"body": "   "})

    result = parse_ai_response(raw)

    assert _rows(result) == [("b.py", None, "suggestion", "Kept")]
    assert [(e.index, e.reason) for e in result.errors] == [
        (0, "Missing or empty 'body' field"),
        (2, "Missing or empty 'body' field"),
    ]
    assert result.json_error is None


def test__parse_ai_response__only_rejected_items__json_error_and_errors() -> None:
    result = parse_ai_response('["just a string", 42]')

    assert result.comments == []
    assert [e.reason for e in result.errors] == ["Expected object, got str", "Expected object, got int"]
    assert result.json_error is not None
    assert len(result.comments_to_store()) == 1


def test__parse_ai_response__json_that_is_not_a_review__json_error() -> None:
    result = parse_ai_response('"just a string"')

    assert result.json_error == "Expected a JSON array of comments, got str"


def test__parse_ai_response__prefers_the_reading_with_most_comments() -> None:
    example = _array({"file": "example.py", "body": "Example"})
    raw = f"The format is {example}, so here goes:\n```json\n{_TWO}\n```"

    assert _rows(parse_ai_response(raw)) == _TWO_ROWS


def test__parse_ai_response__comments_get_distinct_ids() -> None:
    result = parse_ai_response(_TWO)

    assert len({c.id for c in result.comments}) == 2


def test__parse_ai_response__success__comments_to_store_returns_parsed_comments() -> None:
    result = parse_ai_response(_TWO)

    assert result.comments_to_store() == result.comments


@pytest.mark.parametrize(
    "raw",
    [
        "See [1, 2] and (x, y) {y} [z, w] " * 3000,
        "[" + "See [1] and (x) {y} [z] " * 3000 + "]",
        "[" + ", ".join(["{" + "See [1, 2] and (x, y) {y} [z, w] " * 200 + "}"] * 20) + "]",
    ],
    ids=["prose", "bracketed_prose", "objects_of_prose"],
)
def test__parse_ai_response__bracket_soup__finishes_quickly(raw: str) -> None:
    # json-repair is quadratic or worse on such input; the parser must not hand it over.
    started = time.perf_counter()

    result = parse_ai_response(raw)

    assert time.perf_counter() - started < 5
    assert result.json_error is not None


# ── field normalisation ───────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (42, 42),
        ("42", 42),
        ("L42", 42),
        ("42:5", 42),
        ("12-15", 12),
        ("lines 10-20", 10),
        (42.0, 42),
        ([12, 15], 12),
        (0, None),
        (-3, None),
        ("-3", None),
        ("N/A", None),
        ("", None),
        (None, None),
        (True, None),
        ("123456789012", None),
    ],
)
def test__parse_ai_response__line_formats__first_positive_integer(value: object, expected: int | None) -> None:
    result = parse_ai_response(json.dumps([{"file": "a.py", "line": value, "body": "x"}]))

    assert result.comments[0].line == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (" src/a.py ", "src/a.py"),
        ("`src/a.py`", "src/a.py"),
        ("null", None),
        ("N/A", None),
        ("", None),
        (None, None),
        (12, None),
    ],
)
def test__parse_ai_response__file_values__normalised(value: object, expected: str | None) -> None:
    result = parse_ai_response(json.dumps([{"file": value, "body": "x"}]))

    assert result.comments[0].file == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("critical", "critical"),
        ("Critical", "critical"),
        ("BLOCKER", "critical"),
        ("blocking", "critical"),
        ("severe", "critical"),
        ("major", "major"),
        ("High", "major"),
        ("high-severity", "major"),
        ("error", "major"),
        ("bug", "major"),
        ("**Major**", "major"),
        ("minor", "minor"),
        ("Medium", "minor"),
        ("warning", "minor"),
        ("suggestion", "suggestion"),
        ("low", "suggestion"),
        ("nit", "suggestion"),
        ("nit: naming", "suggestion"),
        ("info", "suggestion"),
        ("style", "suggestion"),
        ("note", "suggestion"),
    ],
)
def test__normalize_severity__synonyms__map_onto_the_four_levels(value: str, expected: str) -> None:
    assert normalize_severity(value) == expected


@pytest.mark.parametrize("value", ["whatever", "", 3, None])
def test__normalize_severity__unknown__none(value: object) -> None:
    assert normalize_severity(value) is None


@pytest.mark.parametrize("value", ["whatever", 3, None])
def test__parse_ai_response__unknown_severity__defaults_to_suggestion(value: object) -> None:
    result = parse_ai_response(json.dumps([{"body": "x", "severity": value}]))

    assert result.comments[0].severity == "suggestion"


def test__parse_ai_response__empty_alias__falls_through_to_the_next_one() -> None:
    result = parse_ai_response(json.dumps([{"body": "  ", "message": "From message", "file": "", "path": "a.py"}]))

    assert _rows(result) == [("a.py", None, "suggestion", "From message")]


# ── which readings make up the answer ─────────────────────────────────────────


def test__parse_ai_response__comments_split_across_fences__merged_in_order() -> None:
    raw = (
        "Issues in a.py:\n```json\n"
        + _array({"file": "a.py", "line": 1, "body": "A1"}, {"file": "a.py", "line": 2, "body": "A2"})
        + "\n```\nIssues in b.py:\n```json\n"
        + _array({"file": "b.py", "line": 3, "body": "B1"})
        + "\n```"
    )

    result = parse_ai_response(raw)

    assert [c.body for c in result.comments] == ["A1", "A2", "B1"]
    assert result.json_error is None


def test__parse_ai_response__comments_split_across_arrays_in_prose__merged_without_duplicates() -> None:
    first = _array({"file": "a.py", "body": "A1"})
    second = _array({"file": "b.py", "body": "B1"}, {"file": "a.py", "body": "A1"})
    raw = f"First batch: {first} and the second batch: {second}"

    assert [c.body for c in parse_ai_response(raw).comments] == ["A1", "B1"]


@pytest.mark.parametrize(
    "raw",
    [
        (
            'Example of a valid response:\n[\n  {"file": "src/auth/login.py", "line": 42, "severity": "critical",\n'
            '   "body": "SQL injection risk: concatenated user input."}\n]\nMy answer:\n```json\n[]\n```'
        ),
        (
            'The format is [{"file": "path", "line": 1, "severity": "minor", "body": "text"}]. I found nothing:\n'
            "```json\n[]\n```"
        ),
    ],
    ids=["echoed_prompt_example", "inline_format_example"],
)
def test__parse_ai_response__fenced_answer__beats_an_example_quoted_in_prose(raw: str) -> None:
    result = parse_ai_response(raw)

    assert result.comments == []
    assert result.json_error is None


@pytest.mark.parametrize(
    "raw",
    ["[]\n\nNo issues found.", '{"comments": []}\nThe change looks good.'],
    ids=["array", "wrapper"],
)
def test__parse_ai_response__answer_opens_with_an_empty_review__clean_empty_despite_trailing_prose(raw: str) -> None:
    result = parse_ai_response(raw)

    assert result.comments == []
    assert result.json_error is None
    assert result.comments_to_store() == []


def test__parse_ai_response__answer_opens_with_comments_then_prose__prose_ignored() -> None:
    result = parse_ai_response(_TWO + '\n\nNote: the format was {"file": path')

    assert _rows(result) == _TWO_ROWS
    assert result.truncated is False


@pytest.mark.parametrize(
    "raw",
    [
        'Each item looks like {"file": "...", "body": ... and so on.\n\n' + _TWO,
        '{"plan": [read the diff, then\n\n[{"draft": 1}]\n\nThe review:\n```json\n' + _TWO + "\n```",
    ],
    ids=["after_prose", "opening_the_answer_before_a_fence"],
)
def test__parse_ai_response__unclosed_object_in_preamble__answer_read_and_not_truncated(raw: str) -> None:
    result = parse_ai_response(raw)

    assert _rows(result) == _TWO_ROWS
    assert result.truncated is False


def test__parse_ai_response__wrapper_key_without_comments_first__later_wrapper_key_used() -> None:
    raw = '{"review": {"summary": "Looks fine", "verdict": "approve"}, "comments": ' + _TWO + "}"

    result = parse_ai_response(raw)

    assert _rows(result) == _TWO_ROWS
    assert result.json_error is None


def test__parse_ai_response__deeply_nested_line__no_recursion_error() -> None:
    depth = 995
    raw = '[{"body": "x", "line": ' + "[" * depth + "1" + "]" * depth + "}]"

    result = parse_ai_response(raw)

    assert [c.body for c in result.comments] == ["x"]


# ── worst-case input size and shape ───────────────────────────────────────────


_PATHOLOGICAL_INPUTS = {
    "comma_then_many_block_comments": "[1, " + "/**/ " * 40 + "x]",
    "comma_then_many_line_comments": "[1, // " + "http://x " * 40 + "\nx]",
    "object_comma_then_comments": '{"a": 1, ' + "/* a */ " * 40 + "x}",
    "hyphenated_tokens": "a-" * 100_000,
    "fenced_c_code": "Here\n```c\n" + "    foo(a, /* arg */ b);\n" * 8000 + "```\n",
    "escaped_quotes_outside_strings": '[{\\"file\\": \\"a.py\\", \\"body\\": \\"x\\"}, ' * 4000 + "]",
    "unterminated_block_comments": "[1, /* " * 20_000 + "]",
    "unterminated_smart_quotes": "{“a: " * 20_000 + "}",
    "backtick_run": "`" * 200_000,
    "tilde_run": "~" * 200_000,
}


@pytest.mark.parametrize("raw", list(_PATHOLOGICAL_INPUTS.values()), ids=list(_PATHOLOGICAL_INPUTS))
def test__parse_ai_response__pathological_input__finishes_quickly(raw: str) -> None:
    started = time.perf_counter()

    parse_ai_response(raw)

    assert time.perf_counter() - started < 3
