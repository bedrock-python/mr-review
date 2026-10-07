"""Saved review presets in review_presets.yaml."""

from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import uuid4

import pytest
import yaml
from mr_review.infra.repositories.review_preset import FileReviewPresetRepository

pytestmark = pytest.mark.integration


async def test__preset_repo__create_update_delete_round_trip(data_dir: Path) -> None:
    repo = FileReviewPresetRepository(data_dir)

    created = await repo.create("API", "Public API", "Exported names only.", {"min_severity": "major"})
    updated = await repo.update(created.model_copy(update={"description": "Changed"}))
    reloaded = await FileReviewPresetRepository(data_dir).get_by_id(created.id)

    assert updated is not None
    assert reloaded == updated
    assert await repo.delete(created.id) is True
    assert await repo.list_all() == []
    assert await repo.delete(created.id) is False
    assert await repo.update(created) is None


async def test__preset_repo__concurrent_creates__none_lost(data_dir: Path) -> None:
    repo = FileReviewPresetRepository(data_dir)

    await asyncio.gather(*(repo.create(f"P{i}", "", "", {}) for i in range(10)))

    assert sorted(p.name for p in await repo.list_all()) == sorted(f"P{i}" for i in range(10))


async def test__preset_repo__hand_edited_file__bad_entries_skipped_bad_overrides_dropped(data_dir: Path) -> None:
    good_id = uuid4()
    entries = [
        {
            "id": str(good_id),
            "name": "Good",
            "brief_config": {"max_comments": 0, "output_language": "German", "retired_field": 1},
            "created_at": "2026-01-01T00:00:00",
        },
        {"name": "No id"},
        "not a mapping",
    ]
    (data_dir / "review_presets.yaml").write_text(yaml.safe_dump(entries), encoding="utf-8")

    presets = await FileReviewPresetRepository(data_dir).list_all()

    assert [p.id for p in presets] == [good_id]
    assert presets[0].brief_config == {"output_language": "German"}
    assert presets[0].created_at.tzinfo is not None
