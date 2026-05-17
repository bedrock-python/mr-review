"""Unit tests for FileAIProviderRepository — focus on max_concurrent round-tripping."""

from __future__ import annotations

from pathlib import Path

import pytest
from mr_review.infra.repositories.ai_provider import FileAIProviderRepository

pytestmark = pytest.mark.unit


async def test__create__with_max_concurrent__persists_and_reads_back(tmp_path: Path) -> None:
    """A provider created with max_concurrent set survives a fresh read from disk."""
    repo = FileAIProviderRepository(tmp_path)
    created = await repo.create(
        name="ollama-local",
        type_="openai_compat",
        api_key="ignored",
        base_url="http://localhost:11434",
        models=["llama3"],
        max_concurrent=1,
    )
    assert created.max_concurrent == 1

    reloaded = await FileAIProviderRepository(tmp_path).get_by_id(created.id)
    assert reloaded is not None
    assert reloaded.max_concurrent == 1


async def test__create__without_max_concurrent__defaults_to_none(tmp_path: Path) -> None:
    """Omitting max_concurrent stores None so the global default applies at dispatch time."""
    repo = FileAIProviderRepository(tmp_path)
    created = await repo.create(
        name="claude-cloud",
        type_="claude",
        api_key="sk-test",
        base_url="",
        models=["claude-haiku-4-5"],
    )
    assert created.max_concurrent is None

    reloaded = await FileAIProviderRepository(tmp_path).get_by_id(created.id)
    assert reloaded is not None
    assert reloaded.max_concurrent is None


async def test__update__max_concurrent__overwrites_existing_value(tmp_path: Path) -> None:
    """update(max_concurrent=N) replaces the persisted value."""
    repo = FileAIProviderRepository(tmp_path)
    created = await repo.create(
        name="p",
        type_="claude",
        api_key="k",
        base_url="",
        models=[],
        max_concurrent=1,
    )

    updated = await repo.update(created.id, max_concurrent=3)
    assert updated is not None
    assert updated.max_concurrent == 3

    reloaded = await FileAIProviderRepository(tmp_path).get_by_id(created.id)
    assert reloaded is not None
    assert reloaded.max_concurrent == 3


async def test__update__clear_max_concurrent__resets_to_none(tmp_path: Path) -> None:
    """clear_max_concurrent=True drops the override so the global default applies again."""
    repo = FileAIProviderRepository(tmp_path)
    created = await repo.create(
        name="p",
        type_="claude",
        api_key="k",
        base_url="",
        models=[],
        max_concurrent=2,
    )

    updated = await repo.update(created.id, clear_max_concurrent=True)
    assert updated is not None
    assert updated.max_concurrent is None

    reloaded = await FileAIProviderRepository(tmp_path).get_by_id(created.id)
    assert reloaded is not None
    assert reloaded.max_concurrent is None


async def test__update__max_concurrent_none_without_clear__leaves_existing_value(tmp_path: Path) -> None:
    """Passing max_concurrent=None (the default) is a no-op — only clear_max_concurrent resets."""
    repo = FileAIProviderRepository(tmp_path)
    created = await repo.create(
        name="p",
        type_="claude",
        api_key="k",
        base_url="",
        models=[],
        max_concurrent=2,
    )

    updated = await repo.update(created.id, name="renamed")
    assert updated is not None
    assert updated.name == "renamed"
    assert updated.max_concurrent == 2
