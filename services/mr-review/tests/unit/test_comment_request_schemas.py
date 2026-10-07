from __future__ import annotations

from uuid import uuid4

import pytest
from mr_review.api.schemas.reviews import CreateCommentRequest, UpdateCommentRequest
from pydantic import ValidationError

from tests.factories.entities import make_comment

pytestmark = pytest.mark.unit


def _patch(**fields: object) -> UpdateCommentRequest:
    return UpdateCommentRequest.model_validate({"id": str(uuid4()), **fields})


def test__update_comment__anchor_omitted__keeps_file_and_line() -> None:
    """A patch without file/line leaves the anchor untouched."""
    comment = make_comment(file="src/a.py", line=3)

    updated = _patch(status="dismissed").apply_to(comment)

    assert (updated.file, updated.line, updated.status) == ("src/a.py", 3, "dismissed")


def test__update_comment__explicit_null_file__clears_whole_anchor() -> None:
    """``file: null`` makes the comment general and drops its line as well."""
    comment = make_comment(file="src/a.py", line=3)

    updated = _patch(file=None).apply_to(comment)

    assert (updated.file, updated.line) == (None, None)


def test__update_comment__new_file_and_line__moves_anchor() -> None:
    """Setting both fields re-anchors the comment."""
    comment = make_comment(file="src/a.py", line=3)

    updated = _patch(file="src/b.py", line=40).apply_to(comment)

    assert (updated.file, updated.line) == ("src/b.py", 40)


def test__update_comment__explicit_null_line__keeps_file() -> None:
    """``line: null`` keeps the file and only drops the line."""
    comment = make_comment(file="src/a.py", line=3)

    updated = _patch(line=None).apply_to(comment)

    assert (updated.file, updated.line) == ("src/a.py", None)


def test__update_comment__null_status_fields__are_ignored() -> None:
    """Explicit nulls on non-anchor fields keep the legacy 'not provided' meaning."""
    comment = make_comment(body="keep me", severity="major")

    updated = _patch(body=None, severity=None, status=None).apply_to(comment)

    assert (updated.body, updated.severity, updated.status) == ("keep me", "major", "kept")


def test__update_comment__line_on_general_comment__raises_value_error() -> None:
    """A line patch on a comment without a file would leave a dangling line."""
    comment = make_comment(file=None, line=None)

    with pytest.raises(ValueError, match="general comment"):
        _patch(line=5).apply_to(comment)


@pytest.mark.parametrize(
    "fields",
    [
        {"line": 0},
        {"body": "   "},
        {"file": ""},
        {"file": None, "line": 4},
    ],
)
def test__update_comment__invalid_patch__rejected(fields: dict[str, object]) -> None:
    """Non-positive lines, blank bodies or files and a line without a file fail validation."""
    with pytest.raises(ValidationError):
        _patch(**fields)


def test__create_comment__defaults_to_general_comment() -> None:
    """Without file/line the request describes a general note."""
    request = CreateCommentRequest.model_validate({"severity": "minor", "body": "Looks good"})

    assert (request.file, request.line) == (None, None)


@pytest.mark.parametrize(
    "payload",
    [
        {"severity": "minor", "body": ""},
        {"severity": "minor", "body": "  \n "},
        {"severity": "minor", "body": "x", "file": "a.py", "line": 0},
        {"severity": "minor", "body": "x", "line": 3},
        {"severity": "blocker", "body": "x"},
        {"body": "x"},
    ],
)
def test__create_comment__invalid_payload__rejected(payload: dict[str, object]) -> None:
    """Blank bodies, non-positive lines, a line without a file and bad severities fail validation."""
    with pytest.raises(ValidationError):
        CreateCommentRequest.model_validate(payload)
