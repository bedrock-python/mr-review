from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from mr_review.core.mrs.entities import DiffFile, DiffHunk
from mr_review.infra.vcs._diff_parser import diff_file_from_patch, parse_full_diff
from mr_review.infra.vcs._diff_parser import parse_patch_to_hunks as _parse_diff_text

pytestmark = pytest.mark.unit

# The same table drives the web app's parseDiff tests; the two copies must stay byte-identical.
_CASES_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "unified_diff_cases.json"
_WEB_APP_COPY = (
    Path(__file__).resolve().parents[3]
    / "web-app"
    / "src"
    / "shared"
    / "ui"
    / "DiffViewer"
    / "__fixtures__"
    / "unifiedDiffCases.json"
)
_CASES: dict[str, Any] = json.loads(_CASES_PATH.read_text(encoding="utf-8"))


def _flatten(hunks: list[DiffHunk]) -> list[list[object]]:
    return [[line.type, line.old_line, line.new_line, line.content] for hunk in hunks for line in hunk.lines]


@pytest.mark.parametrize("case", _CASES["patches"], ids=lambda case: case["name"])
def test__parse_patch__shared_case__matches_expected_lines(case: dict[str, Any]) -> None:
    """Every hunk line gets the type and line numbers the shared table expects."""
    hunks = _parse_diff_text(case["patch"])

    assert _flatten(hunks) == case["lines"]


@pytest.mark.parametrize("case", _CASES["diffs"], ids=lambda case: case["name"])
def test__parse_full_diff__shared_case__keeps_every_file_with_its_lines(case: dict[str, Any]) -> None:
    """Every file of the diff is kept (deleted, binary, renamed) and its lines are numbered as expected."""
    files = parse_full_diff(case["diff"])

    actual = [{"path": f.path, "old_path": f.old_path, "lines": _flatten(f.hunks)} for f in files]
    assert actual == case["files"]


@pytest.mark.parametrize("case", _CASES["diffs"], ids=lambda case: case["name"])
def test__parse_full_diff__shared_case__counts_match_the_lines(case: dict[str, Any]) -> None:
    """additions/deletions are the number of added/removed lines, nothing else."""
    for diff_file in parse_full_diff(case["diff"]):
        types = [line.type for hunk in diff_file.hunks for line in hunk.lines]
        assert (diff_file.additions, diff_file.deletions) == (types.count("added"), types.count("removed"))


def test__shared_cases__web_app_copy__is_identical() -> None:
    """The web app tests parse the same table; a drifted copy would let the two parsers disagree."""
    if not _WEB_APP_COPY.exists():
        pytest.skip("web-app sources are not part of this checkout (e.g. the backend test image)")

    assert _WEB_APP_COPY.read_bytes() == _CASES_PATH.read_bytes()


def test__diff_file_from_patch__no_newline_marker__is_not_counted() -> None:
    """The marker used to count as a context line, so additions and the lines after it shifted by one."""
    diff_file = diff_file_from_patch("f.txt", None, "@@ -1 +1,2 @@\n-b\n\\ No newline at end of file\n+b\n+c\n")

    assert (diff_file.additions, diff_file.deletions) == (2, 1)
    assert [line.new_line for line in diff_file.hunks[0].lines if line.type == "added"] == [1, 2]


def test__parse_full_diff__deleted_file__is_kept_under_its_old_path() -> None:
    """``+++ /dev/null`` never set a path, so a deleted file vanished from Bitbucket and Gitea diffs."""
    raw = "diff --git a/gone.txt b/gone.txt\n--- a/gone.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-x\n"

    files = parse_full_diff(raw)

    assert [(f.path, f.deletions) for f in files] == [("gone.txt", 1)]


def test__parse_full_diff__binary_file__is_kept_without_hunks() -> None:
    """A binary file has no ---/+++ lines; it used to be dropped."""
    raw = "diff --git a/logo.png b/logo.png\nindex 1..2 100644\nBinary files a/logo.png and b/logo.png differ\n"

    assert parse_full_diff(raw) == [DiffFile(path="logo.png", additions=0, deletions=0, hunks=[])]


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
