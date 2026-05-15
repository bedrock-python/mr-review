from __future__ import annotations

import pytest
from mr_review.infra.vcs.gitlab import _parse_diff_text


@pytest.mark.unit
def test_parse_empty_diff() -> None:
    result = _parse_diff_text("")
    assert result == []


@pytest.mark.unit
def test_parse_single_hunk() -> None:
    diff = "@@ -1,3 +1,4 @@\n context line\n-removed line\n+added line\n+another added\n"
    hunks = _parse_diff_text(diff)
    assert len(hunks) == 1
    hunk = hunks[0]
    assert hunk.old_start == 1
    assert hunk.new_start == 1
    assert hunk.old_count == 3
    assert hunk.new_count == 4
    assert len(hunk.lines) == 4
    assert hunk.lines[0].type == "context"
    assert hunk.lines[1].type == "removed"
    assert hunk.lines[2].type == "added"
    assert hunk.lines[3].type == "added"


@pytest.mark.unit
def test_parse_multiple_hunks() -> None:
    diff = "@@ -1,2 +1,2 @@\n unchanged\n-old\n@@ -10,2 +10,2 @@\n+new\n unchanged2\n"
    hunks = _parse_diff_text(diff)
    assert len(hunks) == 2
    assert hunks[0].old_start == 1
    assert hunks[1].old_start == 10


@pytest.mark.unit
def test_parse_line_numbers_increment_correctly() -> None:
    diff = "@@ -5,3 +5,3 @@\n context\n-removed\n+added\n"
    hunks = _parse_diff_text(diff)
    assert len(hunks) == 1
    lines = hunks[0].lines
    # context line: old_line=5, new_line=5
    assert lines[0].old_line == 5
    assert lines[0].new_line == 5
    # removed line: old_line=6, new_line=None
    assert lines[1].old_line == 6
    assert lines[1].new_line is None
    # added line: old_line=None, new_line=6
    assert lines[2].old_line is None
    assert lines[2].new_line == 6
