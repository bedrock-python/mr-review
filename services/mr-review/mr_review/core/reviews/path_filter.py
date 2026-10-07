"""Which changed files a review looks at: include/exclude glob patterns over repository paths.

Pattern forms, close to ``.gitignore``:

* ``name/`` — a directory at any depth (``vendor/`` matches ``vendor/a.go`` and ``x/vendor/a.go``);
  with a leading ``/`` only at the repository root;
* no ``/`` — the file name at any depth (``*.lock`` matches ``a/b/uv.lock``);
* any other ``/`` — the whole path from the repository root (a leading ``/`` is optional).

``*`` and ``?`` stay inside one path segment, ``**`` crosses directories and ``[abc]`` / ``[!abc]``
are character classes. Matching is case-sensitive.

Exclude patterns are read after the built-in defaults and, as in ``.gitignore``, the last one that
matches decides: a pattern starting with ``!`` takes a file back in (``!/go.sum`` reviews the root
``go.sum`` while every other default still applies).
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import Final, Literal

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

_Target = Literal["name", "path", "dir"]


def _char_class(glob: str, start: int) -> tuple[str, int] | None:
    """The regex for the ``[...]`` class opening at ``start`` and the index after it, if it closes."""
    end = glob.find("]", start + 2 if glob[start + 1 : start + 2] in ("!", "]") else start + 1)
    if end == -1:
        return None
    body = glob[start + 1 : end]
    negated = body.startswith("!")
    if negated:
        body = body[1:]
    escaped = body.replace("\\", "\\\\").replace("^", "\\^").replace("[", "\\[")
    return f"[{'^' if negated else ''}{escaped}]", end + 1


def _translate(glob: str) -> str:
    """A regex for ``glob`` where ``*`` and ``?`` stop at ``/`` and ``**`` does not."""
    parts: list[str] = []
    i = 0
    while i < len(glob):
        if glob.startswith("**/", i):
            parts.append("(?:.*/)?")
            i += 3
        elif glob.startswith("**", i):
            parts.append(".*")
            i += 2
        elif glob[i] == "*":
            parts.append("[^/]*")
            i += 1
        elif glob[i] == "?":
            parts.append("[^/]")
            i += 1
        elif glob[i] == "[" and (klass := _char_class(glob, i)) is not None:
            parts.append(klass[0])
            i = klass[1]
        else:
            parts.append(re.escape(glob[i]))
            i += 1
    return "".join(parts)


@dataclass(frozen=True, slots=True)
class _Rule:
    pattern: str
    target: _Target
    regex: re.Pattern[str]
    # ``!pattern``: a file it matches is taken back in.
    negated: bool = False

    @classmethod
    def compile(cls, pattern: str) -> _Rule | None:
        text = pattern.strip()
        negated = text.startswith("!")
        if negated:
            text = text[1:].strip()
        if not text.strip("/"):
            return None
        anchored = text.startswith("/")
        if text.endswith("/"):
            body = _translate(text.strip("/"))
            prefix = "" if anchored else "(?:.*/)?"
            return cls(pattern, "dir", re.compile(f"{prefix}{body}/"), negated)
        body_text = text.lstrip("/")
        if "/" not in body_text and not anchored:
            return cls(pattern, "name", re.compile(_translate(body_text)), negated)
        return cls(pattern, "path", re.compile(_translate(body_text)), negated)

    def matches(self, path: str) -> bool:
        if self.target == "dir":
            return self.regex.match(path) is not None
        if self.target == "name":
            return self.regex.fullmatch(path.rsplit("/", 1)[-1]) is not None
        return self.regex.fullmatch(path) is not None


def _compile_all(patterns: Iterable[str]) -> tuple[_Rule, ...]:
    return tuple(rule for rule in (_Rule.compile(p) for p in patterns) if rule is not None)


@dataclass(frozen=True, slots=True)
class ExcludedFile:
    path: str
    # The exclude pattern that matched, or ``NOT_INCLUDED``.
    reason: str


class PathFilter:
    """Decides, path by path, whether a changed file takes part in the review."""

    def __init__(self, include: Sequence[str] = (), exclude: Sequence[str] = ()) -> None:
        """``exclude`` is read in order and the last matching pattern decides."""
        self._include = tuple(rule for rule in _compile_all(include) if not rule.negated)
        self._exclude = _compile_all(exclude)

    @classmethod
    def from_brief(cls, config: BriefConfig) -> PathFilter:
        defaults = DEFAULT_EXCLUDE_PATTERNS if config.use_default_excludes else ()
        return cls(include=config.include_paths, exclude=[*defaults, *config.exclude_paths])

    def exclusion_reason(self, path: str) -> str | None:
        """Why ``path`` is left out, or ``None`` when it is reviewed."""
        normalized = path.lstrip("/")
        if self._include and not any(rule.matches(normalized) for rule in self._include):
            return NOT_INCLUDED
        decisive = next((rule for rule in reversed(self._exclude) if rule.matches(normalized)), None)
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
