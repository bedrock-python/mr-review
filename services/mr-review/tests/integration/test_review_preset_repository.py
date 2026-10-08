"""Saved review presets in review_presets.yaml."""

from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import uuid4

import pytest
import yaml
from mr_review.core.review_presets.entities import ReviewPresetNameTakenError, ReviewPresetNotFoundError
from mr_review.infra.repositories.review_preset import FileReviewPresetRepository
from mr_review.use_cases.review_presets.create_review_preset import CreateReviewPresetUseCase
from mr_review.use_cases.review_presets.update_review_preset import UpdateReviewPresetUseCase

pytestmark = pytest.mark.integration


async def test__preset_repo__create_update_delete_round_trip(data_dir: Path) -> None:
    repo = FileReviewPresetRepository(data_dir)

    created = await repo.create("API", "Public API", "Exported names only.", {"min_severity": "major"})
    updated = await repo.update(created.id, description="Changed")
    reloaded = await FileReviewPresetRepository(data_dir).get_by_id(created.id)

    assert (updated.description, updated.instructions) == ("Changed", "Exported names only.")
    assert updated.updated_at >= created.updated_at
    assert reloaded == updated
    assert await repo.delete(created.id) is True
    assert await repo.list_all() == []
    assert await repo.delete(created.id) is False
    with pytest.raises(ReviewPresetNotFoundError):
        await repo.update(created.id, description="Gone")


async def test__preset_repo__concurrent_creates_with_one_name__exactly_one_wins(data_dir: Path) -> None:
    use_case = CreateReviewPresetUseCase(FileReviewPresetRepository(data_dir))

    results = await asyncio.gather(*(use_case.execute(name) for name in ("API", "api", "Api")), return_exceptions=True)

    assert sum(not isinstance(result, BaseException) for result in results) == 1
    assert sum(isinstance(result, ReviewPresetNameTakenError) for result in results) == 2


async def test__preset_repo__concurrent_updates_of_different_fields__both_kept(data_dir: Path) -> None:
    repo = FileReviewPresetRepository(data_dir)
    use_case = UpdateReviewPresetUseCase(repo)
    created = await repo.create("API", "", "", {})

    await asyncio.gather(
        use_case.execute(created.id, description="New description"),
        use_case.execute(created.id, instructions="New instructions"),
        use_case.execute(created.id, brief_config={"max_comments": 5}),
    )

    stored = await repo.get_by_id(created.id)
    assert stored is not None
    assert (stored.description, stored.instructions, stored.brief_config) == (
        "New description",
        "New instructions",
        {"max_comments": 5},
    )


async def test__preset_repo__rename_onto_another_presets_name__refused(data_dir: Path) -> None:
    repo = FileReviewPresetRepository(data_dir)
    await repo.create("API", "", "", {})
    other = await repo.create("Security", "", "", {})

    with pytest.raises(ReviewPresetNameTakenError):
        await repo.update(other.id, name="api")
    assert (await repo.update(other.id, name="SECURITY")).name == "SECURITY"


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


async def test__preset_repo__upsert_with__stores_as_given_and_checks_the_name(data_dir: Path) -> None:
    repo = FileReviewPresetRepository(data_dir)
    taken = await repo.create("API", "", "", {})
    other = await repo.create("Docs", "", "", {})
    incoming = other.model_copy(update={"id": uuid4(), "name": "Imported"})

    stored = await repo.upsert_with(incoming.id, lambda _current: incoming)
    with pytest.raises(ReviewPresetNameTakenError):
        await repo.upsert_with(
            other.id, lambda current: current.model_copy(update={"name": "api"}) if current else None
        )

    assert stored == incoming
    assert await repo.get_by_id(incoming.id) == incoming
    assert await repo.get_by_id(other.id) == other
    assert await repo.get_by_id(taken.id) == taken
