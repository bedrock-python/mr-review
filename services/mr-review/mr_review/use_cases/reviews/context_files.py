"""Fetching what a prompt is built from, besides the diff: project context files, full contents of
changed files, tests and imported code next to them, and recent commits.

Collectors return whole file contents; how much of them fits in the prompt is the prompt
builder's call. Every fetch is a call to the VCS host: they share one semaphore, ``CONCURRENCY``
wide, and are capped per collector.
"""

from __future__ import annotations

import asyncio
import os
import posixpath
import re
from collections.abc import Callable, Coroutine, Iterable, Sequence
from dataclasses import dataclass, field
from typing import Final

from mr_review.core.mrs.entities import DiffFile
from mr_review.core.reviews.entities import BriefConfig
from mr_review.core.vcs.protocols import VCSProvider

_DEFAULT_CONTEXT_PATHS = [
    "CLAUDE.md",
    ".claude/CLAUDE.md",
    ".claude/rules",
    ".cursor/rules",
    "CONTRIBUTING.md",
    "README.md",
    ".github/CONTRIBUTING.md",
]

_READABLE_EXTENSIONS = {".md", ".mdc", ".txt", ".rst"}

_MAX_FILES = 20

# Concurrent requests to the VCS host per prompt; the semaphore alone paces them.
CONCURRENCY: Final = 5

_MAX_FULL_FILES: Final = 15
# Directories listed (recursively) while looking for tests next to the changed files.
_MAX_TEST_DIRS: Final = 12
_ROOT_TEST_DIRS: Final = ("tests", "test", "__tests__", "spec", "specs")
# Test files whose name contains a changed file's stem come first; shorter stems match too much.
_MIN_STEM_CHARS: Final = 3
# Changed files read to find what they import, and import targets tried.
_MAX_RELATED_SOURCES: Final = 30
_MAX_COMMITS_PER_FILE = 8
_MAX_COMMIT_HISTORY_FILES = 50

PathAllowed = Callable[[str], bool]


def _allow_all(_path: str) -> bool:
    return True


async def _gather_limited[T](
    coros: Iterable[Coroutine[object, object, T]], semaphore: asyncio.Semaphore
) -> list[T | BaseException]:
    """Run every coroutine at once, each holding a slot of ``semaphore`` while it runs.

    A failure is returned in its slot of the result instead of being raised.
    """

    async def _guarded(coro: Coroutine[object, object, T]) -> T:
        async with semaphore:
            return await coro

    return await asyncio.gather(*(_guarded(c) for c in coros), return_exceptions=True)


def merge_context(context_contents: dict[str, str]) -> str:
    """Merge {path: content} into a single context.md string."""
    parts = [f"### {path}\n\n{content}" for path, content in context_contents.items()]
    return "\n\n---\n\n".join(parts)


async def _resolve_path(
    provider: VCSProvider,
    repo_path: str,
    path: str,
    ref: str,
) -> list[str]:
    # Runs inside _gather_limited, which already holds a semaphore slot for this coroutine —
    # acquiring the same semaphore again here would deadlock once every slot is held by an
    # outer acquisition.
    ext = os.path.splitext(path)[1].lower()
    content = await provider.get_file(repo_path, path, ref)
    if content is not None:
        return [path]
    if ext in _READABLE_EXTENSIONS or not ext:
        dir_files = await provider.list_directory(repo_path, path, ref)
        return [f for f in dir_files if os.path.splitext(f)[1].lower() in _READABLE_EXTENSIONS]
    return []


def _deduplicate(items: list[str], limit: int) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            result.append(item)
    return result[:limit]


async def _fetch_contents(
    provider: VCSProvider,
    repo_path: str,
    paths: Sequence[str],
    ref: str,
    semaphore: asyncio.Semaphore,
) -> dict[str, str]:
    """``{path: content}`` for the paths that exist, in the order given."""

    async def _fetch(file_path: str) -> tuple[str, str | None]:
        return file_path, await provider.get_file(repo_path, file_path, ref)

    out: dict[str, str] = {}
    for item in await _gather_limited((_fetch(p) for p in paths), semaphore):
        if isinstance(item, BaseException):
            continue
        path, content = item
        if isinstance(content, str):
            out[path] = content
    return out


async def collect_context_files(
    provider: VCSProvider,
    repo_path: str,
    requested_paths: list[str],
    ref: str = "HEAD",
    semaphore: asyncio.Semaphore | None = None,
) -> dict[str, str]:
    """Return {relative_path: content} for project context files.

    If requested_paths is empty, auto-discovers standard convention files.
    Directories are expanded recursively; unknown paths are silently skipped.
    Enforces a cap of _MAX_FILES files.
    """
    paths_to_resolve = requested_paths if requested_paths else _DEFAULT_CONTEXT_PATHS
    semaphore = semaphore or asyncio.Semaphore(CONCURRENCY)

    resolve_results = await _gather_limited(
        (_resolve_path(provider, repo_path, p, ref) for p in paths_to_resolve), semaphore
    )
    resolved: list[str] = []
    for item in resolve_results:
        if isinstance(item, list):
            resolved.extend(item)

    unique = _deduplicate(resolved, _MAX_FILES)
    return await _fetch_contents(provider, repo_path, unique, ref, semaphore)


def is_deleted(diff_file: DiffFile) -> bool:
    """Whether the change removes the file: its diff has lines and every one of them is removed.

    A file whose diff came back empty — a host collapses large or generated files, binary and
    rename-only changes have no lines — still exists and is worth reading in full.
    """
    lines = [line for hunk in diff_file.hunks for line in hunk.lines]
    return bool(lines) and all(line.type == "removed" for line in lines)


async def collect_full_files(
    provider: VCSProvider,
    repo_path: str,
    diff_files: list[DiffFile],
    ref: str = "HEAD",
    semaphore: asyncio.Semaphore | None = None,
) -> dict[str, str]:
    """Full contents of the first ``_MAX_FULL_FILES`` changed files that were not deleted.

    Binary content is dropped later, when the prompt is built.
    """
    targets = [df.path for df in diff_files if not is_deleted(df)][:_MAX_FULL_FILES]
    return await _fetch_contents(provider, repo_path, targets, ref, semaphore or asyncio.Semaphore(CONCURRENCY))


_TEST_PATTERNS = re.compile(
    r"(^|[/_-])(test_|_test\.|\.test\.|\.spec\.|__tests__)",
    re.IGNORECASE,
)
_TEST_DIR_NAMES = {"tests", "test", "__tests__", "spec", "specs"}


def _is_test_path(path: str) -> bool:
    parts = path.replace("\\", "/").split("/")
    for part in parts:
        if part in _TEST_DIR_NAMES:
            return True
    basename = parts[-1] if parts else path
    return bool(_TEST_PATTERNS.search(basename))


def _candidate_test_dirs(diff_files: Sequence[DiffFile]) -> list[str]:
    """Directories to list for tests: each changed file's directory, or the usual top-level test
    directories for files at the root.

    Listings are recursive, so a directory inside another candidate adds nothing and is dropped.
    """
    ordered: list[str] = []
    for df in diff_files:
        directory = posixpath.dirname(df.path)
        for candidate in (directory,) if directory else _ROOT_TEST_DIRS:
            if candidate not in ordered:
                ordered.append(candidate)
    covered = [d for d in ordered if not any(d.startswith(other + "/") for other in ordered)]
    return covered[:_MAX_TEST_DIRS]


def _stem(path: str) -> str:
    return posixpath.basename(path).split(".", 1)[0].lower()


def _rank_test_paths(listings: Sequence[object], diff_files: Sequence[DiffFile], allowed: PathAllowed) -> list[str]:
    """Test files from the listings, those named after a changed file first, at most ``_MAX_FILES``."""
    stems = {stem for df in diff_files if len(stem := _stem(df.path)) >= _MIN_STEM_CHARS}
    found: list[str] = []
    seen: set[str] = set()
    for item in listings:
        if not isinstance(item, list):
            continue
        for path in item:
            if isinstance(path, str) and path not in seen and _is_test_path(path) and allowed(path):
                seen.add(path)
                found.append(path)

    def _named_after_change(path: str) -> bool:
        name = posixpath.basename(path).lower()
        return any(stem in name for stem in stems)

    found.sort(key=lambda path: not _named_after_change(path))
    return found[:_MAX_FILES]


async def collect_test_files(
    provider: VCSProvider,
    repo_path: str,
    diff_files: list[DiffFile],
    ref: str = "HEAD",
    semaphore: asyncio.Semaphore | None = None,
    allowed: PathAllowed = _allow_all,
) -> dict[str, str]:
    """Find and fetch test files next to the changed files."""
    semaphore = semaphore or asyncio.Semaphore(CONCURRENCY)
    listings = await _gather_limited(
        (provider.list_directory(repo_path, d, ref) for d in _candidate_test_dirs(diff_files)), semaphore
    )
    test_paths = _rank_test_paths(listings, diff_files, allowed)
    return await _fetch_contents(provider, repo_path, test_paths, ref, semaphore)


# Import patterns for Python and JS/TS
_PYTHON_IMPORT_RE = re.compile(
    r"^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))",
    re.MULTILINE,
)
_JS_IMPORT_RE = re.compile(
    r"""(?:^import\s+.*?from\s+|require\s*\(\s*)['"]([^'"]+)['"]""",
    re.MULTILINE,
)
_PYTHON_EXTENSIONS: Final = frozenset({".py"})
_JS_EXTENSIONS: Final = frozenset({".ts", ".tsx", ".js", ".jsx", ".mjs"})
_JS_RESOLVE_EXTENSIONS: Final = (".ts", ".tsx", ".js", ".jsx")


def _extract_imports(path: str, content: str) -> list[str]:
    """Return module names imported in the file (best-effort)."""
    ext = os.path.splitext(path)[1].lower()
    if ext in _PYTHON_EXTENSIONS:
        matches = _PYTHON_IMPORT_RE.findall(content)
        return [m[0] or m[1] for m in matches if m[0] or m[1]]
    if ext in _JS_EXTENSIONS:
        return _JS_IMPORT_RE.findall(content)
    return []


def _python_module_files(importing_file: str, module: str) -> list[str]:
    """Files a relative Python import may name: ``from ..pkg.mod import x`` read from
    ``a/b/c.py`` is ``a/pkg/mod.py`` or the package ``a/pkg/mod/__init__.py``."""
    dots = len(module) - len(module.lstrip("."))
    if dots == 0:
        return []  # absolute imports: third-party, or a package root this code cannot know
    base = posixpath.dirname(importing_file)
    for _ in range(dots - 1):
        base = posixpath.dirname(base)
    rest = module[dots:].replace(".", "/")
    target = posixpath.join(base, rest) if rest else base
    if not rest:
        return [posixpath.join(target, "__init__.py")]
    return [f"{target}.py", posixpath.join(target, "__init__.py")]


def _js_module_files(importing_file: str, module: str) -> list[str]:
    if not module.startswith("."):
        return []  # packages, aliases
    target = posixpath.normpath(posixpath.join(posixpath.dirname(importing_file), module))
    if os.path.splitext(target)[1].lower() in _JS_EXTENSIONS:
        return [target]
    return [target + ext for ext in _JS_RESOLVE_EXTENSIONS]


def _module_files(importing_file: str, module: str) -> list[str]:
    """Repository files an import in ``importing_file`` may resolve to, most likely first."""
    if os.path.splitext(importing_file)[1].lower() in _PYTHON_EXTENSIONS:
        return _python_module_files(importing_file, module)
    return _js_module_files(importing_file, module)


def _import_candidates(
    source_results: Sequence[object],
    already_changed: set[str],
    allowed: PathAllowed,
) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()
    for item in source_results:
        if not isinstance(item, tuple):
            continue
        importing_path, content = item
        if not isinstance(importing_path, str) or not isinstance(content, str):
            continue
        for module in _extract_imports(importing_path, content):
            for path in _module_files(importing_path, module):
                if path not in already_changed and path not in seen and allowed(path):
                    seen.add(path)
                    candidates.append(path)
    return candidates[:_MAX_FILES]


async def collect_related_code(
    provider: VCSProvider,
    repo_path: str,
    diff_files: list[DiffFile],
    ref: str = "HEAD",
    semaphore: asyncio.Semaphore | None = None,
    allowed: PathAllowed = _allow_all,
) -> dict[str, str]:
    """Fetch files the changed Python and JS/TS files import (relative imports only)."""
    already_changed = {df.path for df in diff_files}
    semaphore = semaphore or asyncio.Semaphore(CONCURRENCY)
    sources = [
        df.path
        for df in diff_files
        if not is_deleted(df) and os.path.splitext(df.path)[1].lower() in _PYTHON_EXTENSIONS | _JS_EXTENSIONS
    ][:_MAX_RELATED_SOURCES]

    async def _fetch_source(path: str) -> tuple[str, str | None]:
        return path, await provider.get_file(repo_path, path, ref)

    source_results = await _gather_limited((_fetch_source(path) for path in sources), semaphore)
    candidate_paths = _import_candidates(source_results, already_changed, allowed)
    return await _fetch_contents(provider, repo_path, candidate_paths, ref, semaphore)


async def collect_commit_history(
    provider: VCSProvider,
    repo_path: str,
    diff_files: list[DiffFile],
    ref: str = "HEAD",
    semaphore: asyncio.Semaphore | None = None,
) -> dict[str, list[dict[str, str]]]:
    """Fetch recent commits for each changed file in parallel.

    Capped at _MAX_COMMIT_HISTORY_FILES files to avoid excessive API calls on large MRs.
    """
    semaphore = semaphore or asyncio.Semaphore(CONCURRENCY)
    capped_files = diff_files[:_MAX_COMMIT_HISTORY_FILES]

    async def _fetch(df: DiffFile) -> tuple[str, list[dict[str, str]]]:
        commits = await provider.get_commits(repo_path, df.path, ref=ref, limit=_MAX_COMMITS_PER_FILE)
        return df.path, commits

    results = await _gather_limited((_fetch(df) for df in capped_files), semaphore)
    return {
        path: commits for item in results if not isinstance(item, BaseException) for path, commits in [item] if commits
    }


@dataclass(frozen=True, slots=True)
class GatheredContext:
    """Everything fetched for a prompt besides the diff and the MR's own text."""

    context_files: dict[str, str] = field(default_factory=dict)
    full_files: dict[str, str] = field(default_factory=dict)
    test_files: dict[str, str] = field(default_factory=dict)
    related_code: dict[str, str] = field(default_factory=dict)
    commit_history: dict[str, list[dict[str, str]]] = field(default_factory=dict)


async def _nothing() -> dict[str, str]:
    return {}


async def _no_history() -> dict[str, list[dict[str, str]]]:
    return {}


async def gather_context(
    provider: VCSProvider,
    repo_path: str,
    diff_files: list[DiffFile],
    config: BriefConfig,
    ref: str,
    allowed: PathAllowed = _allow_all,
) -> GatheredContext:
    """Run the collectors the brief turns on, together, over the changed files under review."""
    semaphore = asyncio.Semaphore(CONCURRENCY)
    context_files, full_files, test_files, related_code, commit_history = await asyncio.gather(
        collect_context_files(provider, repo_path, config.context_files, ref, semaphore)
        if config.include_context
        else _nothing(),
        collect_full_files(provider, repo_path, diff_files, ref, semaphore)
        if config.include_full_files
        else _nothing(),
        collect_test_files(provider, repo_path, diff_files, ref, semaphore, allowed)
        if config.include_test_context
        else _nothing(),
        collect_related_code(provider, repo_path, diff_files, ref, semaphore, allowed)
        if config.include_related_code
        else _nothing(),
        collect_commit_history(provider, repo_path, diff_files, ref, semaphore)
        if config.include_commit_history
        else _no_history(),
    )
    return GatheredContext(
        context_files=context_files,
        full_files=full_files,
        test_files=test_files,
        related_code=related_code,
        commit_history=commit_history,
    )
