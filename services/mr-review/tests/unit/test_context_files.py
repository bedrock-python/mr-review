"""Unit tests for collect_context_files."""

from __future__ import annotations

from collections.abc import Mapping
from unittest.mock import AsyncMock

import pytest
from mr_review.use_cases.reviews.context_files import (
    _MAX_FILES,
    collect_context_files,
)

pytestmark = pytest.mark.unit


def _make_provider(
    files: Mapping[str, str | None] | None = None,
    dirs: Mapping[str, list[str]] | None = None,
) -> AsyncMock:
    """Create a mock VCS provider.

    files: {path: content_or_None}  — get_file return values
    dirs:  {path: [file_paths]}     — list_directory return values
    """
    resolved_files: Mapping[str, str | None] = files if files is not None else {}
    resolved_dirs: Mapping[str, list[str]] = dirs if dirs is not None else {}

    async def get_file(repo_path: str, file_path: str, ref: str = "HEAD") -> str | None:
        return resolved_files.get(file_path)

    async def list_directory(repo_path: str, dir_path: str, ref: str = "HEAD") -> list[str]:
        return resolved_dirs.get(dir_path, [])

    provider = AsyncMock()
    provider.get_file.side_effect = get_file
    provider.list_directory.side_effect = list_directory
    return provider


# ── auto-discovery mode ───────────────────────────────────────────────────────


async def test__collect__empty_requested_paths__uses_default_paths() -> None:
    provider = _make_provider(files={"CLAUDE.md": "# Project rules"})
    result = await collect_context_files(provider, "org/repo", requested_paths=[])

    assert "CLAUDE.md" in result
    assert result["CLAUDE.md"] == "# Project rules"


async def test__collect__empty_requested_paths__skips_missing_default_files() -> None:
    provider = _make_provider(files={})
    result = await collect_context_files(provider, "org/repo", requested_paths=[])

    assert result == {}


async def test__collect__empty_requested_paths__finds_multiple_default_files() -> None:
    provider = _make_provider(
        files={
            ".claude/CLAUDE.md": "claude rules",
            "CONTRIBUTING.md": "contribution guide",
        }
    )
    result = await collect_context_files(provider, "org/repo", requested_paths=[])

    assert ".claude/CLAUDE.md" in result
    assert "CONTRIBUTING.md" in result


# ── manual mode ───────────────────────────────────────────────────────────────


async def test__collect__explicit_file_paths__fetches_only_those() -> None:
    provider = _make_provider(
        files={
            "docs/arch.md": "Architecture docs",
            "README.md": "Readme",
            "CONTRIBUTING.md": "Should not appear",
        }
    )
    result = await collect_context_files(provider, "org/repo", requested_paths=["docs/arch.md", "README.md"])

    assert "docs/arch.md" in result
    assert "README.md" in result
    assert "CONTRIBUTING.md" not in result


async def test__collect__nonexistent_explicit_path__silently_skipped() -> None:
    provider = _make_provider(files={})
    result = await collect_context_files(provider, "org/repo", requested_paths=["nonexistent/file.md"])

    assert result == {}


# ── directory expansion ───────────────────────────────────────────────────────


async def test__collect__directory_path__expands_recursively() -> None:
    provider = _make_provider(
        files={
            ".claude/rules/backend.md": "backend rules",
            ".claude/rules/frontend.md": "frontend rules",
        },
        dirs={
            ".claude/rules": [".claude/rules/backend.md", ".claude/rules/frontend.md"],
        },
    )
    result = await collect_context_files(provider, "org/repo", requested_paths=[".claude/rules"])

    assert ".claude/rules/backend.md" in result
    assert ".claude/rules/frontend.md" in result


async def test__collect__directory_with_non_readable_files__skips_them() -> None:
    provider = _make_provider(
        files={
            ".claude/rules/style.md": "style rules",
            ".claude/rules/binary.bin": "binary content",
        },
        dirs={
            ".claude/rules": [".claude/rules/style.md", ".claude/rules/binary.bin"],
        },
    )
    result = await collect_context_files(provider, "org/repo", requested_paths=[".claude/rules"])

    assert ".claude/rules/style.md" in result
    assert ".claude/rules/binary.bin" not in result


async def test__collect__empty_directory__returns_empty() -> None:
    provider = _make_provider(dirs={".claude/rules": []})
    result = await collect_context_files(provider, "org/repo", requested_paths=[".claude/rules"])

    assert result == {}


# ── limits ────────────────────────────────────────────────────────────────────


async def test__collect__exceeds_max_files__truncates_to_limit() -> None:
    many_files = {f"file_{i}.md": f"content {i}" for i in range(_MAX_FILES + 5)}
    provider = _make_provider(files=many_files)

    result = await collect_context_files(
        provider,
        "org/repo",
        requested_paths=list(many_files.keys()),
    )

    assert len(result) == _MAX_FILES


# ── deduplication ─────────────────────────────────────────────────────────────


async def test__collect__duplicate_paths__fetched_only_once() -> None:
    provider = _make_provider(files={"README.md": "readme"})

    result = await collect_context_files(provider, "org/repo", requested_paths=["README.md", "README.md"])

    assert list(result.keys()).count("README.md") == 1
