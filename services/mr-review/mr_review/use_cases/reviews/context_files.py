from __future__ import annotations

import asyncio
import os
import random
import re
from typing import Any

from mr_review.core.mrs.entities import DiffFile
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

# Context is embedded in the prompt when total chars are below this threshold;
# above it the caller should offer context.md as a separate download file.
CONTEXT_EMBED_CHARS = 40_000 * 4  # ~40k tokens, same scale as diff warn threshold

# Rate-limit guard: max concurrent GitLab API requests and inter-batch delay.
CONCURRENCY = 5
_BATCH_DELAY_S = 0.15  # seconds between batches
_JITTER_S = 0.05  # ±50 ms jitter to avoid thundering herd


async def _rate_limited_gather(
    coros: list[Any],
    semaphore: asyncio.Semaphore,
) -> list[Any]:
    """Run coroutines with a shared semaphore, draining in CONCURRENCY-sized batches
    with a small sleep between batches to respect GitLab rate limits."""

    async def _guarded(coro: Any) -> Any:
        async with semaphore:
            return await coro

    results: list[Any] = []
    for i in range(0, len(coros), CONCURRENCY):
        batch = coros[i : i + CONCURRENCY]
        batch_results = await asyncio.gather(*[_guarded(c) for c in batch], return_exceptions=True)
        results.extend(batch_results)
        if i + CONCURRENCY < len(coros):
            jitter = random.uniform(-_JITTER_S, _JITTER_S)  # noqa: S311
            await asyncio.sleep(_BATCH_DELAY_S + jitter)
    return results


def merge_context(context_contents: dict[str, str]) -> str:
    """Merge {path: content} into a single context.md string."""
    parts = [f"### {path}\n\n{content}" for path, content in context_contents.items()]
    return "\n\n---\n\n".join(parts)


async def _resolve_path(
    provider: VCSProvider,
    repo_path: str,
    path: str,
    ref: str,
    resolved: list[str],
    semaphore: asyncio.Semaphore,
) -> None:
    ext = os.path.splitext(path)[1].lower()
    if ext in _READABLE_EXTENSIONS or not ext:
        async with semaphore:
            content = await provider.get_file(repo_path, path, ref)
        if content is not None:
            resolved.append(path)
            return
        async with semaphore:
            dir_files = await provider.list_directory(repo_path, path, ref)
        resolved.extend(f for f in dir_files if os.path.splitext(f)[1].lower() in _READABLE_EXTENSIONS)
    else:
        async with semaphore:
            content = await provider.get_file(repo_path, path, ref)
        if content is not None:
            resolved.append(path)


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
    paths: list[str],
    ref: str,
    semaphore: asyncio.Semaphore,
    max_chars: int | None = None,
) -> dict[str, str]:
    async def _fetch(file_path: str) -> tuple[str, str | None]:
        content = await provider.get_file(repo_path, file_path, ref)
        return file_path, content

    results = await _rate_limited_gather([_fetch(p) for p in paths], semaphore)
    out: dict[str, str] = {}
    for item in results:
        if isinstance(item, Exception):
            continue
        path, content = item
        if content is not None:
            out[path] = content[:max_chars] if max_chars else content
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

    resolved: list[str] = []
    for path in paths_to_resolve:
        await _resolve_path(provider, repo_path, path, ref, resolved, semaphore)

    unique = _deduplicate(resolved, _MAX_FILES)
    return await _fetch_contents(provider, repo_path, unique, ref, semaphore)


_MAX_FULL_FILE_CHARS = 50_000
_MAX_FULL_FILES = 15

_TEST_PATTERNS = re.compile(
    r"(^|[/_-])(test_|_test\.|\.test\.|\.spec\.|__tests__)",
    re.IGNORECASE,
)
_TEST_DIR_NAMES = {"tests", "test", "__tests__", "spec", "specs"}

# Import patterns for Python and JS/TS
_PYTHON_IMPORT_RE = re.compile(
    r"^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))",
    re.MULTILINE,
)
_JS_IMPORT_RE = re.compile(
    r"""(?:^import\s+.*?from\s+|require\s*\(\s*)['"]([^'"]+)['"]""",
    re.MULTILINE,
)


async def collect_full_files(
    provider: VCSProvider,
    repo_path: str,
    diff_files: list[DiffFile],
    ref: str = "HEAD",
    semaphore: asyncio.Semaphore | None = None,
) -> dict[str, str]:
    """Fetch full content of every changed file (not deleted) in parallel."""
    targets = [df.path for df in diff_files[:_MAX_FULL_FILES]]
    semaphore = semaphore or asyncio.Semaphore(CONCURRENCY)

    async def _fetch(path: str) -> tuple[str, str | None]:
        content = await provider.get_file(repo_path, path, ref)
        return path, content

    results = await _rate_limited_gather([_fetch(p) for p in targets], semaphore)

    result: dict[str, str] = {}
    for item in results:
        if isinstance(item, Exception):
            continue
        path, content = item
        if content is not None:
            result[path] = content[:_MAX_FULL_FILE_CHARS]
    return result


def _is_test_path(path: str) -> bool:
    parts = path.replace("\\", "/").split("/")
    for part in parts:
        if part in _TEST_DIR_NAMES:
            return True
    basename = parts[-1] if parts else path
    return bool(_TEST_PATTERNS.search(basename))


def _candidate_test_dirs(diff_files: list[DiffFile]) -> list[str]:
    checked: set[str] = set()
    dirs: list[str] = []
    for df in diff_files:
        dir_path = os.path.dirname(df.path)
        for name in [""] + list(_TEST_DIR_NAMES):
            d = os.path.join(dir_path, name).replace("\\", "/").rstrip("/") if name else dir_path
            if d not in checked:
                checked.add(d)
                dirs.append(d or ".")
    return dirs


def _filter_test_paths(dir_results: list[Any]) -> list[str]:
    paths: list[str] = []
    seen: set[str] = set()
    for item in dir_results:
        if isinstance(item, Exception):
            continue
        _, files = item
        for fp in files:
            if _is_test_path(fp) and fp not in seen:
                seen.add(fp)
                paths.append(fp)
    return paths[:_MAX_FILES]


async def collect_test_files(
    provider: VCSProvider,
    repo_path: str,
    diff_files: list[DiffFile],
    ref: str = "HEAD",
    semaphore: asyncio.Semaphore | None = None,
) -> dict[str, str]:
    """Find and fetch test files adjacent to each changed file."""
    semaphore = semaphore or asyncio.Semaphore(CONCURRENCY)

    candidate_dirs = _candidate_test_dirs(diff_files)

    async def _list(d: str) -> tuple[str, list[str]]:
        files = await provider.list_directory(repo_path, d, ref)
        return d, files

    dir_results = await _rate_limited_gather([_list(d) for d in candidate_dirs], semaphore)
    test_paths = _filter_test_paths(dir_results)
    return await _fetch_contents(provider, repo_path, test_paths, ref, semaphore, _MAX_FULL_FILE_CHARS)


def _extract_imports(path: str, content: str) -> list[str]:
    """Return module names imported in the file (best-effort)."""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".py":
        matches = _PYTHON_IMPORT_RE.findall(content)
        return [m[0] or m[1] for m in matches if m[0] or m[1]]
    if ext in {".ts", ".tsx", ".js", ".jsx", ".mjs"}:
        return _JS_IMPORT_RE.findall(content)
    return []


def _module_to_path(importing_file: str, module: str) -> str | None:
    """Convert a relative import to a file path (best-effort, no FS access)."""
    if not module.startswith("."):
        return None  # skip third-party / absolute modules
    base_dir = os.path.dirname(importing_file)
    raw = os.path.normpath(os.path.join(base_dir, module)).replace("\\", "/")
    return raw


_RELATED_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx"}


def _module_variants(candidate_base: str) -> list[str]:
    ext = os.path.splitext(candidate_base)[1].lower()
    if ext in _RELATED_EXTENSIONS:
        return [candidate_base]
    return [candidate_base + e for e in _RELATED_EXTENSIONS]


def _collect_from_source(
    importing_path: str,
    content: str,
    already_changed: set[str],
    seen: set[str],
    candidates: list[str],
) -> None:
    for module in _extract_imports(importing_path, content):
        candidate_base = _module_to_path(importing_path, module)
        if candidate_base is None:
            continue
        for v in _module_variants(candidate_base):
            if v not in already_changed and v not in seen:
                seen.add(v)
                candidates.append(v)


def _import_candidates(source_results: list[Any], already_changed: set[str]) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()
    for item in source_results:
        if isinstance(item, Exception):
            continue
        importing_path, content = item
        if content is not None:
            _collect_from_source(importing_path, content, already_changed, seen, candidates)
    return candidates[:_MAX_FILES]


async def collect_related_code(
    provider: VCSProvider,
    repo_path: str,
    diff_files: list[DiffFile],
    ref: str = "HEAD",
    semaphore: asyncio.Semaphore | None = None,
) -> dict[str, str]:
    """Fetch files that are imported by any changed file."""
    already_changed = {df.path for df in diff_files}
    semaphore = semaphore or asyncio.Semaphore(CONCURRENCY)

    async def _fetch_source(path: str) -> tuple[str, str | None]:
        content = await provider.get_file(repo_path, path, ref)
        return path, content

    source_results = await _rate_limited_gather([_fetch_source(df.path) for df in diff_files], semaphore)
    candidate_paths = _import_candidates(source_results, already_changed)
    return await _fetch_contents(provider, repo_path, candidate_paths, ref, semaphore, _MAX_FULL_FILE_CHARS)


_MAX_COMMITS_PER_FILE = 8
_MAX_COMMIT_HISTORY_FILES = 50


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

    results = await _rate_limited_gather([_fetch(df) for df in capped_files], semaphore)

    return {path: commits for item in results if not isinstance(item, Exception) for path, commits in [item] if commits}
