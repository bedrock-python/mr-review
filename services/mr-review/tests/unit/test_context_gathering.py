"""How the collectors pace VCS calls and choose what to fetch: full files, tests and imported code."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from unittest.mock import AsyncMock

import pytest
from mr_review.core.mrs.entities import DiffFile, DiffHunk, DiffLine
from mr_review.use_cases.reviews.context_files import (
    CONCURRENCY,
    collect_full_files,
    collect_related_code,
    collect_test_files,
)

pytestmark = pytest.mark.unit


def _changed(path: str, *, new_lines: int = 1) -> DiffFile:
    lines = [DiffLine(type="added", new_line=i + 1, content="x") for i in range(new_lines)]
    return DiffFile(
        path=path,
        additions=new_lines,
        deletions=0,
        hunks=[DiffHunk(old_start=0, old_count=0, new_start=1, new_count=new_lines, lines=lines)],
    )


def _deleted(path: str) -> DiffFile:
    hunk = DiffHunk(
        old_start=1, old_count=1, new_start=0, new_count=0, lines=[DiffLine(type="removed", old_line=1, content="x")]
    )
    return DiffFile(path=path, additions=0, deletions=1, hunks=[hunk])


def _no_lines(path: str) -> DiffFile:
    """A change the host sent no lines for: a binary file, or a diff collapsed for its size."""
    return DiffFile(path=path, additions=0, deletions=0, hunks=[])


def _provider(files: Mapping[str, str] | None = None, dirs: Mapping[str, list[str]] | None = None) -> AsyncMock:
    known_files = files or {}
    known_dirs = dirs or {}

    async def get_file(_repo: str, path: str, _ref: str = "HEAD") -> str | None:
        return known_files.get(path)

    async def list_directory(_repo: str, path: str, _ref: str = "HEAD") -> list[str]:
        return known_dirs.get(path, [])

    provider = AsyncMock()
    provider.get_file.side_effect = get_file
    provider.list_directory.side_effect = list_directory
    return provider


def _requested_files(provider: AsyncMock) -> list[str]:
    return [call.args[1] for call in provider.get_file.await_args_list]


# ── pacing ────────────────────────────────────────────────────────────────────


async def test__gathering__a_slow_call_does_not_hold_back_the_next_ones() -> None:
    """Calls start as soon as a slot frees up: no batch waits for its slowest member.

    The first file can only finish once the sixth fetch has started — strict batches of
    ``CONCURRENCY`` would never get there.
    """
    paths = [f"src/f{i}.py" for i in range(CONCURRENCY + 1)]
    sixth_started = asyncio.Event()

    async def get_file(_repo: str, path: str, _ref: str = "HEAD") -> str:
        if path == paths[-1]:
            sixth_started.set()
        if path == paths[0]:
            await sixth_started.wait()
        return "content"

    provider = AsyncMock()
    provider.get_file.side_effect = get_file

    result = await asyncio.wait_for(
        collect_full_files(provider, "org/repo", [_changed(p) for p in paths], "HEAD"), timeout=2
    )

    assert list(result) == paths


async def test__gathering__concurrency_capped_by_the_semaphore() -> None:
    running = 0
    peak = 0

    async def get_file(_repo: str, _path: str, _ref: str = "HEAD") -> str:
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.005)
        running -= 1
        return "content"

    provider = AsyncMock()
    provider.get_file.side_effect = get_file

    await collect_full_files(provider, "org/repo", [_changed(f"f{i}.py") for i in range(12)], "HEAD")

    assert peak == CONCURRENCY


# ── full files ────────────────────────────────────────────────────────────────


async def test__full_files__deleted_files_not_fetched() -> None:
    diff = [_deleted("old.py"), _changed("src/a.py"), _changed("src/b.py")]
    provider = _provider(files={"src/a.py": "a", "src/b.py": "b"})

    result = await collect_full_files(provider, "org/repo", diff, "HEAD")

    assert result == {"src/a.py": "a", "src/b.py": "b"}
    assert _requested_files(provider) == ["src/a.py", "src/b.py"]


async def test__full_files__file_whose_diff_came_back_empty_still_fetched() -> None:
    """GitLab sends ``diff: ""`` for a file too large to show; it still exists at the head."""
    provider = _provider(files={"db/schema.sql": "CREATE TABLE t (id int);"})

    result = await collect_full_files(provider, "org/repo", [_no_lines("db/schema.sql")], "HEAD")

    assert result == {"db/schema.sql": "CREATE TABLE t (id int);"}


async def test__full_files__cap_counts_only_files_with_content() -> None:
    diff = [_deleted(f"gone{i}.py") for i in range(15)] + [_changed(f"src/f{i}.py") for i in range(20)]
    provider = _provider(files={f"src/f{i}.py": "x" for i in range(20)})

    result = await collect_full_files(provider, "org/repo", diff, "HEAD")

    assert list(result) == [f"src/f{i}.py" for i in range(15)]


# ── test context ──────────────────────────────────────────────────────────────


async def test__test_files__nested_directories_listed_once_through_their_parent() -> None:
    diff = [_changed("src/a/x.py"), _changed("src/a/y.py"), _changed("src/b/z.py"), _changed("src/c.py")]
    provider = _provider(dirs={"src": ["src/a/test_x.py", "src/b/z.py"]}, files={"src/a/test_x.py": "t"})

    result = await collect_test_files(provider, "org/repo", diff, "HEAD")

    assert [call.args[1] for call in provider.list_directory.await_args_list] == ["src"]
    assert result == {"src/a/test_x.py": "t"}


async def test__test_files__root_level_change__top_level_test_directories_listed() -> None:
    provider = _provider(dirs={"tests": ["tests/test_setup.py"]}, files={"tests/test_setup.py": "t"})

    result = await collect_test_files(provider, "org/repo", [_changed("setup.py")], "HEAD")

    listed = [call.args[1] for call in provider.list_directory.await_args_list]
    assert listed == ["tests", "test", "__tests__", "spec", "specs"]
    assert result == {"tests/test_setup.py": "t"}


async def test__test_files__directory_listings_capped() -> None:
    diff = [_changed(f"pkg{i}/mod.py") for i in range(30)]
    provider = _provider()

    await collect_test_files(provider, "org/repo", diff, "HEAD")

    assert provider.list_directory.await_count == 12


async def test__test_files__tests_named_after_a_changed_file_first_and_filtered_paths_skipped() -> None:
    listing = [f"src/tests/test_other{i}.py" for i in range(25)] + [
        "src/tests/test_billing.py",
        "src/node_modules/x/test_billing.py",
    ]
    files = dict.fromkeys(listing, "t")
    provider = _provider(dirs={"src": listing}, files=files)

    result = await collect_test_files(
        provider, "org/repo", [_changed("src/billing.py")], "HEAD", allowed=lambda p: "node_modules/" not in p
    )

    assert next(iter(result)) == "src/tests/test_billing.py"
    assert "src/node_modules/x/test_billing.py" not in result
    assert len(result) == 20


# ── related code ──────────────────────────────────────────────────────────────


async def test__related_code__python_relative_imports_resolved_to_module_files() -> None:
    source = "from .utils import helper\nfrom ..core.models import Order\nimport os\nfrom . import sibling\n"
    provider = _provider(
        files={
            "app/api/views.py": source,
            "app/api/utils.py": "def helper(): ...",
            "app/core/models.py": "class Order: ...",
        }
    )

    result = await collect_related_code(provider, "org/repo", [_changed("app/api/views.py")], "HEAD")

    assert result == {"app/api/utils.py": "def helper(): ...", "app/core/models.py": "class Order: ..."}


async def test__related_code__js_relative_imports_resolved_with_extensions() -> None:
    source = "import { api } from './api';\nimport React from 'react';\n"
    provider = _provider(files={"web/src/App.tsx": source, "web/src/api.ts": "export const api = 1;"})

    result = await collect_related_code(provider, "org/repo", [_changed("web/src/App.tsx")], "HEAD")

    assert result == {"web/src/api.ts": "export const api = 1;"}


async def test__related_code__only_capped_importing_sources_are_read() -> None:
    diff = [_changed(f"src/m{i}.py") for i in range(40)] + [_changed("README.md"), _deleted("src/gone.py")]
    provider = _provider()

    await collect_related_code(provider, "org/repo", diff, "HEAD")

    assert _requested_files(provider) == [f"src/m{i}.py" for i in range(30)]


async def test__related_code__filtered_paths_not_fetched() -> None:
    source = "from .generated_pb2 import Message\nfrom .service import run\n"
    provider = _provider(files={"svc/main.py": source, "svc/service.py": "def run(): ..."})

    result = await collect_related_code(
        provider, "org/repo", [_changed("svc/main.py")], "HEAD", allowed=lambda p: not p.endswith("_pb2.py")
    )

    assert result == {"svc/service.py": "def run(): ..."}
    assert "svc/generated_pb2.py" not in _requested_files(provider)
