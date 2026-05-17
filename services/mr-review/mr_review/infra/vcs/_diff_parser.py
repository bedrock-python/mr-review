"""Shared diff-parsing utilities for VCS providers."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from mr_review.core.mrs.entities import DiffFile, DiffHunk, DiffLine

_HUNK_HEADER_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")

_FILE_HEADER_RE = re.compile(r"^diff --git a/(.+) b/(.+)$")
_OLD_FILE_RE = re.compile(r"^--- a/(.+)$")
_NEW_FILE_RE = re.compile(r"^\+\+\+ b/(.+)$")


def parse_datetime(value: str) -> datetime:
    """Parse an ISO-8601 datetime string, normalising Z and ensuring UTC tzinfo."""
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def apply_diff_line(
    hunk: DiffHunk,
    raw_line: str,
    old_line: int,
    new_line: int,
) -> tuple[int, int]:
    if raw_line.startswith("+") and not raw_line.startswith("+++"):
        hunk.lines.append(DiffLine(type="added", new_line=new_line, content=raw_line[1:]))
        return old_line, new_line + 1
    if raw_line.startswith("-") and not raw_line.startswith("---"):
        hunk.lines.append(DiffLine(type="removed", old_line=old_line, content=raw_line[1:]))
        return old_line + 1, new_line
    content = raw_line[1:] if raw_line.startswith(" ") else raw_line
    hunk.lines.append(DiffLine(type="context", old_line=old_line, new_line=new_line, content=content))
    return old_line + 1, new_line + 1


def parse_patch_to_hunks(patch: str) -> list[DiffHunk]:
    """Parse a unified diff patch string into DiffHunk objects."""
    hunks: list[DiffHunk] = []
    current_hunk: DiffHunk | None = None
    old_line = 0
    new_line = 0

    for raw_line in patch.splitlines():
        m = _HUNK_HEADER_RE.match(raw_line)
        if m:
            if current_hunk is not None:
                hunks.append(current_hunk)
            old_start = int(m.group(1))
            new_start = int(m.group(3))
            current_hunk = DiffHunk(
                old_start=old_start,
                new_start=new_start,
                old_count=int(m.group(2)) if m.group(2) is not None else 1,
                new_count=int(m.group(4)) if m.group(4) is not None else 1,
                lines=[],
            )
            old_line, new_line = old_start, new_start
            continue

        if current_hunk is not None:
            old_line, new_line = apply_diff_line(current_hunk, raw_line, old_line, new_line)

    if current_hunk is not None:
        hunks.append(current_hunk)

    return hunks


def _build_diff_file(path: str, old_path: str | None, diff_lines: list[str]) -> DiffFile:
    diff_text = "\n".join(diff_lines)
    hunks = parse_patch_to_hunks(diff_text)
    additions = sum(1 for ln in diff_lines if ln.startswith("+") and not ln.startswith("+++"))
    deletions = sum(1 for ln in diff_lines if ln.startswith("-") and not ln.startswith("---"))
    return DiffFile(
        path=path,
        old_path=old_path if old_path and old_path != path else None,
        additions=additions,
        deletions=deletions,
        hunks=hunks,
    )


@dataclass
class _DiffState:
    diff_files: list[DiffFile] = field(default_factory=list)
    current_path: str | None = None
    current_old_path: str | None = None
    current_diff: list[str] = field(default_factory=list)
    old_path: str | None = None
    new_path: str | None = None

    def flush(self) -> None:
        if self.current_path is not None:
            self.diff_files.append(_build_diff_file(self.current_path, self.current_old_path, self.current_diff))

    def handle_file_header(self, m: re.Match[str]) -> None:
        self.flush()
        self.current_path = None
        self.current_old_path = None
        self.current_diff = []
        self.old_path = m.group(1)
        self.new_path = m.group(2)


def parse_full_diff(raw: str) -> list[DiffFile]:
    """Parse a full multi-file unified diff string into DiffFile objects."""
    state = _DiffState()

    for line in raw.splitlines():
        m = _FILE_HEADER_RE.match(line)
        if m:
            state.handle_file_header(m)
            continue

        m2 = _OLD_FILE_RE.match(line)
        if m2 and state.old_path:
            state.current_old_path = m2.group(1) if m2.group(1) != "/dev/null" else None
            continue

        m3 = _NEW_FILE_RE.match(line)
        if m3 and state.new_path:
            state.current_path = m3.group(1) if m3.group(1) != "/dev/null" else state.old_path
            continue

        if state.current_path is not None:
            state.current_diff.append(line)

    state.flush()
    return state.diff_files
