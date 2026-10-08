"""Which changed files a review looks at: include/exclude glob patterns over repository paths.

Patterns follow ``.gitignore``:

* a pattern without a slash, or with only a trailing one, matches at any depth (``*.lock``
  matches ``a/b/uv.lock``, ``docs`` matches ``x/docs/a.md``); any other slash ties it to the
  repository root (``src/generated/`` matches ``src/generated/a.py`` but not
  ``tools/src/generated/b.py``; ``/docs`` only the top-level ``docs``);
* a pattern that matches a directory matches everything below it (``docs``, ``migrations``,
  ``services/api``); a trailing ``/`` matches directories only;
* ``*``, ``?`` and ``[abc]`` / ``[!abc]`` stay within a path segment, ``**`` as a whole segment
  spans directories (``**/test_*.py``, ``a/**/b``, ``docs/**``), ``\\`` makes the next character
  literal (``app/\\[slug\\]/page.tsx``), ``#`` starts a comment, unescaped trailing spaces are
  ignored;
* the last matching pattern decides, and one starting with ``!`` takes a file back in.

Where this differs from git: a leading ``./`` means the repository root (git matches nothing),
and ``!`` takes a file back in even when a directory above it is excluded (git cannot), so
``!/vendor/keep.go`` reviews that one file despite the default ``vendor/``.

User patterns match case-sensitively, as git does on Linux; the built-in defaults ignore case,
so ``*.png`` also leaves out ``Screenshot.PNG``. Exclude patterns are read after the defaults.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Final

from mr_review.core.mrs.entities import DiffFile
from mr_review.core.reviews.entities import BriefConfig

# Files a review rarely gains anything from: lockfiles, minified bundles and source maps,
# generated or vendored code, and binary assets.
DEFAULT_EXCLUDE_PATTERNS: Final[tuple[str, ...]] = (
    # lockfiles (*.lock covers poetry.lock, uv.lock, Cargo.lock, yarn.lock, Gemfile.lock, composer.lock)
    "*.lock",
    "package-lock.json",
    "npm-shrinkwrap.json",
    "pnpm-lock.yaml",
    "bun.lockb",
    "go.sum",
    # minified bundles and source maps
    "*.min.js",
    "*.min.css",
    "*.map",
    # generated and vendored code
    "vendor/",
    "node_modules/",
    "dist/",
    "*_pb2.py",
    "*_pb2.pyi",
    "*_pb2_grpc.py",
    "*.pb.go",
    # binary assets
    "*.png",
    "*.jpg",
    "*.jpeg",
    "*.gif",
    "*.bmp",
    "*.ico",
    "*.webp",
    "*.tif",
    "*.tiff",
    "*.psd",
    "*.pdf",
    "*.zip",
    "*.gz",
    "*.tgz",
    "*.bz2",
    "*.xz",
    "*.7z",
    "*.rar",
    "*.jar",
    "*.war",
    "*.class",
    "*.pyc",
    "*.so",
    "*.dylib",
    "*.dll",
    "*.exe",
    "*.bin",
    "*.wasm",
    "*.woff",
    "*.woff2",
    "*.ttf",
    "*.otf",
    "*.eot",
    "*.mp3",
    "*.mp4",
    "*.mov",
    "*.avi",
    "*.webm",
    "*.wav",
    "*.sqlite",
    "*.db",
)

# Reported as the reason when non-empty include patterns match none of a file's path.
NOT_INCLUDED: Final = "(not matched by the include patterns)"

_CLASS_SPECIALS: Final = frozenset("\\]^[")


def _char_class(glob: str, start: int) -> tuple[str, int] | None:
    """The regex for the ``[...]`` class opening at ``start`` and the index after it; ``None`` when
    it never closes. A class never matches ``/``, and ``\\`` escapes the next character."""
    i = start + 1
    negated = i < len(glob) and glob[i] in "!^"
    if negated:
        i += 1
    members: list[str] = []
    first = True
    while i < len(glob):
        char = glob[i]
        if char == "]" and not first:
            body = "".join(members)
            return (f"[^/{body}]" if negated else f"[{body}]"), i + 1
        if char == "\\" and i + 1 < len(glob):
            i += 1
            char = glob[i]
            members.append("\\" + char if char in _CLASS_SPECIALS or char == "-" else char)
        else:
            members.append("\\" + char if char in _CLASS_SPECIALS else char)
        first = False
        i += 1
    return None


def _double_star(glob: str, start: int) -> tuple[str, int]:
    """The regex for the ``**`` at ``start`` and the index after it."""
    at_segment_start = start == 0 or glob[start - 1] == "/"
    after = start + 2
    if at_segment_start and after < len(glob) and glob[after] == "/":
        return "(?:.*/)?", after + 1  # **/ — any number of directories, none included
    if at_segment_start and after == len(glob):
        return ".*", after  # a trailing /** — everything below
    return "[^/]*", after  # elsewhere it is an ordinary *


def _translate(glob: str) -> str:
    """A regex for ``glob``: ``*``, ``?`` and classes stay within a path segment; ``**`` as a whole
    segment spans directories (``**/x``, ``a/**/b``, ``a/**``), anywhere else it is a plain ``*``;
    ``\\`` makes the next character literal."""
    parts: list[str] = []
    i = 0
    while i < len(glob):
        char = glob[i]
        if char == "\\" and i + 1 < len(glob):
            parts.append(re.escape(glob[i + 1]))
            i += 2
        elif glob.startswith("**", i):
            regex, i = _double_star(glob, i)
            parts.append(regex)
        elif char == "*":
            parts.append("[^/]*")
            i += 1
        elif char == "?":
            parts.append("[^/]")
            i += 1
        elif char == "[" and (klass := _char_class(glob, i)) is not None:
            parts.append(klass[0])
            i = klass[1]
        else:
            parts.append(re.escape(char))
            i += 1
    return "".join(parts)


def _strip_trailing_spaces(text: str) -> str:
    """Trailing spaces are dropped unless escaped with ``\\``, as in ``.gitignore``."""
    end = len(text)
    while end > 0 and text[end - 1] == " " and not (end >= 2 and text[end - 2] == "\\"):
        end -= 1
    return text[:end]


@dataclass(frozen=True, slots=True)
class _Rule:
    pattern: str
    regex: re.Pattern[str]
    # ``name/``: matches directories only — so the files below them, never a file of that name.
    dir_only: bool
    # ``!pattern``: a file it matches is taken back in.
    negated: bool

    @classmethod
    def compile(cls, pattern: str, *, ignore_case: bool = False) -> _Rule | None:
        text = _strip_trailing_spaces(pattern.lstrip())
        if not text or text.startswith("#"):
            return None
        negated = text.startswith("!")
        if negated:
            text = text[1:]
        if text.startswith("./"):
            text = "/" + text[2:]
        dir_only = text.endswith("/")
        text = text.rstrip("/")
        # A slash at the start or in the middle ties the pattern to the repository root.
        anchored = "/" in text
        text = text.lstrip("/")
        if not text:
            return None
        prefix = "" if anchored else "(?:.*/)?"
        regex = re.compile(prefix + _translate(text), re.IGNORECASE if ignore_case else 0)
        return cls(pattern.strip(), regex, dir_only, negated)

    def matches(self, candidate: str, *, is_dir: bool) -> bool:
        return (is_dir or not self.dir_only) and self.regex.fullmatch(candidate) is not None


def _compile_all(patterns: Iterable[str], *, ignore_case: bool = False) -> tuple[_Rule, ...]:
    compiled = (_Rule.compile(p, ignore_case=ignore_case) for p in patterns)
    return tuple(rule for rule in compiled if rule is not None)


def _decisive(rules: Sequence[_Rule], path: str) -> _Rule | None:
    """The last rule matching ``path`` or one of its directories — a pattern that matches a
    directory covers everything below it."""
    segments = path.split("/")
    candidates = [("/".join(segments[:depth]), True) for depth in range(1, len(segments))]
    candidates.append((path, False))
    return next(
        (rule for rule in reversed(rules) if any(rule.matches(c, is_dir=d) for c, d in candidates)),
        None,
    )


@dataclass(frozen=True, slots=True)
class ExcludedFile:
    path: str
    # The exclude pattern that matched, or ``NOT_INCLUDED``.
    reason: str


class PathFilter:
    """Decides, path by path, whether a changed file takes part in the review."""

    def __init__(
        self,
        include: Sequence[str] = (),
        exclude: Sequence[str] = (),
        default_exclude: Sequence[str] = (),
    ) -> None:
        """``default_exclude`` (matched ignoring case) is read before ``exclude`` (case-sensitive),
        and the last matching pattern decides."""
        self._include = _compile_all(include)
        self._has_include = any(not rule.negated for rule in self._include)
        self._exclude = (*_compile_all(default_exclude, ignore_case=True), *_compile_all(exclude))

    @classmethod
    def from_brief(cls, config: BriefConfig) -> PathFilter:
        defaults = DEFAULT_EXCLUDE_PATTERNS if config.use_default_excludes else ()
        return cls(include=config.include_paths, exclude=config.exclude_paths, default_exclude=defaults)

    def exclusion_reason(self, path: str) -> str | None:
        """Why ``path`` is left out, or ``None`` when it is reviewed."""
        normalized = path.strip("/")
        if normalized.startswith("./"):
            normalized = normalized[2:]
        if self._has_include:
            included = _decisive(self._include, normalized)
            if included is None or included.negated:
                return NOT_INCLUDED
        decisive = _decisive(self._exclude, normalized)
        return None if decisive is None or decisive.negated else decisive.pattern

    def allows(self, path: str) -> bool:
        return self.exclusion_reason(path) is None

    def split(self, diff_files: Sequence[DiffFile]) -> tuple[list[DiffFile], list[ExcludedFile]]:
        """The changed files to review, in order, and the ones left out with the reason."""
        kept: list[DiffFile] = []
        excluded: list[ExcludedFile] = []
        for diff_file in diff_files:
            reason = self.exclusion_reason(diff_file.path)
            if reason is None:
                kept.append(diff_file)
            else:
                excluded.append(ExcludedFile(path=diff_file.path, reason=reason))
        return kept, excluded
