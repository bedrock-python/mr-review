from __future__ import annotations

import pytest
from mr_review.infra.vcs.gitlab import _parse_diff_text

pytestmark = pytest.mark.unit


def test__parse_diff_text__empty_string__returns_empty_list() -> None:
    """Empty diff produces no hunks."""
    # Arrange / Act
    result = _parse_diff_text("")

    # Assert
    assert result == []


def test__parse_diff_text__single_hunk__returns_one_hunk_with_correct_header() -> None:
    """A diff with one @@ header parses into exactly one hunk with correct range info."""
    # Arrange
    diff = "@@ -1,3 +1,4 @@\n context line\n-removed line\n+added line\n+another added\n"

    # Act
    hunks = _parse_diff_text(diff)

    # Assert
    assert len(hunks) == 1
    hunk = hunks[0]
    assert hunk.old_start == 1
    assert hunk.new_start == 1
    assert hunk.old_count == 3
    assert hunk.new_count == 4


def test__parse_diff_text__single_hunk__classifies_line_types_correctly() -> None:
    """Context, removed, and added lines are classified by their prefix character."""
    # Arrange
    diff = "@@ -1,3 +1,4 @@\n context line\n-removed line\n+added line\n+another added\n"

    # Act
    hunks = _parse_diff_text(diff)

    # Assert
    lines = hunks[0].lines
    assert len(lines) == 4
    assert lines[0].type == "context"
    assert lines[1].type == "removed"
    assert lines[2].type == "added"
    assert lines[3].type == "added"


def test__parse_diff_text__multiple_hunks__returns_all_hunks_in_order() -> None:
    """A diff with two @@ headers produces two hunks with correct start lines."""
    # Arrange
    diff = "@@ -1,2 +1,2 @@\n unchanged\n-old\n@@ -10,2 +10,2 @@\n+new\n unchanged2\n"

    # Act
    hunks = _parse_diff_text(diff)

    # Assert
    assert len(hunks) == 2
    assert hunks[0].old_start == 1
    assert hunks[1].old_start == 10


def test__parse_diff_text__hunk_with_offset__increments_line_numbers_correctly() -> None:
    """Line numbers start at the hunk offset and increment per line type rules."""
    # Arrange
    diff = "@@ -5,3 +5,3 @@\n context\n-removed\n+added\n"

    # Act
    hunks = _parse_diff_text(diff)

    # Assert
    lines = hunks[0].lines
    # context line: both old and new counters advance
    assert lines[0].old_line == 5
    assert lines[0].new_line == 5
    # removed line: only old counter advances; new_line is absent
    assert lines[1].old_line == 6
    assert lines[1].new_line is None
    # added line: only new counter advances; old_line is absent
    assert lines[2].old_line is None
    assert lines[2].new_line == 6
