"""Shared diff-parsing utilities for VCS providers.

Inside a hunk a line is classified by its first character only (``+`` added, ``-`` removed, a space —
or nothing at all, for a blank line whose space was stripped — context), and the counts in the ``@@``
header say where the hunk ends. So a removed SQL comment (``--- note``) or an added ``++i`` stays a
content line, and only lines outside a hunk can be file headers. ``\\ No newline at end of file``
annotates the line above it and is never a line of the file.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from mr_review.core.mrs.entities import DiffFile, DiffHunk, DiffLine

_HUNK_HEADER_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")
_BINARY_RE = re.compile(r"^Binary files (.+) and (.+) differ$")

_DEV_NULL = "/dev/null"
_GIT_DIFF_PREFIX = "diff --git "
_ESCAPES = {"a": 7, "b": 8, "t": 9, "n": 10, "v": 11, "f": 12, "r": 13, '"': 34, "\\": 92}


def parse_datetime(value: str) -> datetime:
    """Parse an ISO-8601 datetime string, normalising Z and ensuring UTC tzinfo."""
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@dataclass
class _HunkReader:
    """Collects one file's hunks, using the ``@@`` counts to know which lines belong to a hunk."""

    hunks: list[DiffHunk] = field(default_factory=list)
    additions: int = 0
    deletions: int = 0
    _old_left: int = 0
    _new_left: int = 0
    _old_line: int = 0
    _new_line: int = 0

    @property
    def in_hunk(self) -> bool:
        return self._old_left > 0 or self._new_left > 0

    def start(self, header: re.Match[str]) -> None:
        old_start, new_start = int(header.group(1)), int(header.group(3))
        old_count = int(header.group(2)) if header.group(2) is not None else 1
        new_count = int(header.group(4)) if header.group(4) is not None else 1
        self.hunks.append(
            DiffHunk(old_start=old_start, new_start=new_start, old_count=old_count, new_count=new_count, lines=[])
        )
        self._old_left, self._new_left = old_count, new_count
        self._old_line, self._new_line = old_start, new_start

    def feed(self, raw: str) -> bool:
        """Take ``raw`` as the next line of the current hunk; ``False`` when it cannot be one (the hunk ends)."""
        lines = self.hunks[-1].lines
        tag = raw[:1]
        if tag == "\\":
            return True
        if tag == "+" and self._new_left > 0:
            lines.append(DiffLine(type="added", new_line=self._new_line, content=raw[1:]))
            self._new_line += 1
            self._new_left -= 1
            self.additions += 1
            return True
        if tag == "-" and self._old_left > 0:
            lines.append(DiffLine(type="removed", old_line=self._old_line, content=raw[1:]))
            self._old_line += 1
            self._old_left -= 1
            self.deletions += 1
            return True
        if tag in (" ", "") and self._old_left > 0 and self._new_left > 0:
            lines.append(DiffLine(type="context", old_line=self._old_line, new_line=self._new_line, content=raw[1:]))
            self._old_line += 1
            self._new_line += 1
            self._old_left -= 1
            self._new_left -= 1
            return True
        # The header promised more lines than the hunk has: it is over.
        self._old_left = self._new_left = 0
        return False


def _split_lines(text: str) -> list[str]:
    # Only "\n" ends a diff line: str.splitlines() would also split on form feeds and other
    # separators that can sit inside a source line. The newline ending the text is not a blank line.
    lines = text.split("\n")
    if lines[-1] == "":
        lines.pop()
    return lines


@dataclass(frozen=True)
class ParsedPatch:
    hunks: list[DiffHunk]
    additions: int
    deletions: int


def parse_patch(patch: str) -> ParsedPatch:
    """Parse one file's unified diff (its hunks), counting added/removed lines in the same pass."""
    reader = _HunkReader()
    for raw in _split_lines(patch):
        if reader.in_hunk and reader.feed(raw):
            continue
        header = _HUNK_HEADER_RE.match(raw)
        if header:
            reader.start(header)
    return ParsedPatch(hunks=reader.hunks, additions=reader.additions, deletions=reader.deletions)


def parse_patch_to_hunks(patch: str) -> list[DiffHunk]:
    """Parse a unified diff patch string into DiffHunk objects."""
    return parse_patch(patch).hunks


def diff_file_from_patch(path: str, old_path: str | None, patch: str) -> DiffFile:
    """Build a DiffFile from one file's unified diff text, counting changes while parsing."""
    parsed = parse_patch(patch)
    return DiffFile(
        path=path,
        old_path=old_path if old_path and old_path != path else None,
        additions=parsed.additions,
        deletions=parsed.deletions,
        hunks=parsed.hunks,
    )


def _unquote(path: str) -> str:
    """Undo git's C-style quoting of unusual paths: ``"a/\\320\\264.md"`` -> ``a/д.md``."""
    if len(path) < 2 or not (path.startswith('"') and path.endswith('"')):
        return path
    body = path[1:-1]
    out = bytearray()
    i = 0
    while i < len(body):
        char = body[i]
        if char != "\\" or i + 1 == len(body):
            out.extend(char.encode())
            i += 1
            continue
        escaped = body[i + 1]
        octal = body[i + 1 : i + 4]
        if len(octal) == 3 and all(c in "01234567" for c in octal):
            out.append(int(octal, 8))
            i += 4
        else:
            out.append(_ESCAPES.get(escaped, ord(escaped)))
            i += 2
    return out.decode("utf-8", errors="replace")


def _header_path(value: str) -> str | None:
    """The path of a ``---``/``+++``/binary header operand; ``None`` for ``/dev/null``."""
    path = _unquote(value.split("\t", 1)[0].rstrip("\r"))
    if path == _DEV_NULL:
        return None
    return path[2:] if path[:2] in ("a/", "b/") else path


def _git_header_paths(rest: str) -> tuple[str, str] | None:
    """Old and new path of ``diff --git <rest>``; ``a/x b/x`` with spaces in ``x`` is split in the middle."""
    rest = rest.rstrip("\r")
    if rest.startswith('"'):
        end = rest.find('" ', 1)
        while end != -1 and rest[end - 1] == "\\":
            end = rest.find('" ', end + 1)
        if end == -1:
            return None
        old, new = rest[: end + 1], rest[end + 2 :]
    else:
        half = (len(rest) - 1) // 2
        if rest[half : half + 3] == " b/" and rest[2:half] == rest[half + 3 :]:
            old, new = rest[:half], rest[half + 1 :]
        elif " b/" in rest:
            old, new = rest.rsplit(" b/", 1)
            new = "b/" + new
        else:
            return None
    old_path, new_path = _header_path(old), _header_path(new)
    if old_path is None or new_path is None:
        return None
    return old_path, new_path


@dataclass
class _FileEntry:
    old_path: str | None = None
    new_path: str | None = None
    saw_old_header: bool = False
    reader: _HunkReader = field(default_factory=_HunkReader)

    def to_diff_file(self) -> DiffFile | None:
        path = self.new_path or self.old_path
        if path is None:
            return None
        return DiffFile(
            path=path,
            old_path=self.old_path if self.new_path and self.old_path and self.old_path != self.new_path else None,
            additions=self.reader.additions,
            deletions=self.reader.deletions,
            hunks=self.reader.hunks,
        )


@dataclass
class _FullDiffState:
    files: list[DiffFile] = field(default_factory=list)
    current: _FileEntry | None = None

    def start_file(self) -> _FileEntry:
        self.flush()
        self.current = _FileEntry()
        return self.current

    def flush(self) -> None:
        if self.current is not None and (diff_file := self.current.to_diff_file()) is not None:
            self.files.append(diff_file)
        self.current = None

    def entry(self) -> _FileEntry:
        return self.current if self.current is not None else self.start_file()

    def header(self, line: str) -> None:  # noqa: C901 — one branch per kind of git header line
        stripped = line.rstrip("\r")
        if stripped.startswith(_GIT_DIFF_PREFIX):
            entry = self.start_file()
            paths = _git_header_paths(stripped[len(_GIT_DIFF_PREFIX) :])
            if paths is not None:
                entry.old_path, entry.new_path = paths
        elif stripped.startswith("--- "):
            current = self.current
            # A second "---" (or one after hunks) without "diff --git" in between starts the next file.
            entry = self.start_file() if current is None or current.saw_old_header or current.reader.hunks else current
            entry.saw_old_header = True
            entry.old_path = _header_path(stripped[4:])
        elif stripped.startswith("+++ "):
            entry = self.entry()
            entry.new_path = _header_path(stripped[4:])
        elif stripped.startswith("rename from "):
            self.entry().old_path = _unquote(stripped[len("rename from ") :])
        elif stripped.startswith("rename to "):
            self.entry().new_path = _unquote(stripped[len("rename to ") :])
        elif binary := _BINARY_RE.match(stripped):
            entry = self.entry()
            entry.old_path = _header_path(binary.group(1))
            entry.new_path = _header_path(binary.group(2))
        elif hunk := _HUNK_HEADER_RE.match(stripped):
            self.entry().reader.start(hunk)


def parse_full_diff(raw: str) -> list[DiffFile]:
    """Parse a multi-file git diff into DiffFile objects.

    Every file in the diff is kept: deleted ones (``+++ /dev/null``) under their old path, binary and
    rename-only ones without hunks.
    """
    state = _FullDiffState()
    for line in _split_lines(raw):
        current = state.current
        if current is not None and current.reader.in_hunk and current.reader.feed(line):
            continue
        state.header(line)
    state.flush()
    return state.files
