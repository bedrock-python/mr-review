from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

import yaml

from mr_review.core.review_presets.entities import (
    ReviewPreset,
    ReviewPresetNameTakenError,
    ReviewPresetNotFoundError,
)
from mr_review.core.reviews.entities import normalize_brief_overrides
from mr_review.infra.utils import now_utc as _now_utc

_log = logging.getLogger(__name__)


def _aware(value: object) -> datetime:
    parsed = datetime.fromisoformat(str(value))
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


def _preset_from_dict(data: dict[str, object]) -> ReviewPreset:
    raw_overrides = data.get("brief_config")
    overrides = (
        normalize_brief_overrides({str(k): v for k, v in raw_overrides.items()}, strict=False)
        if isinstance(raw_overrides, dict)
        else {}
    )
    return ReviewPreset(
        id=UUID(str(data["id"])),
        name=str(data["name"]),
        description=str(data.get("description") or ""),
        instructions=str(data.get("instructions") or ""),
        brief_config=overrides,
        created_at=_aware(data["created_at"]),
        updated_at=_aware(data.get("updated_at") or data["created_at"]),
    )


def _ensure_name_free(items: list[dict[str, object]], name: str, *, except_id: UUID | None) -> None:
    wanted = name.casefold()
    for item in items:
        if str(item.get("id")) != str(except_id) and str(item.get("name", "")).casefold() == wanted:
            raise ReviewPresetNameTakenError(f"A review preset named {item.get('name')!r} already exists")


def _preset_to_dict(preset: ReviewPreset) -> dict[str, object]:
    return {
        "id": str(preset.id),
        "name": preset.name,
        "description": preset.description,
        "instructions": preset.instructions,
        "brief_config": dict(preset.brief_config),
        "created_at": preset.created_at.isoformat(),
        "updated_at": preset.updated_at.isoformat(),
    }


class FileReviewPresetRepository:
    """Saved review presets in ``review_presets.yaml`` under the data directory."""

    def __init__(self, data_dir: Path) -> None:
        self._path = data_dir / "review_presets.yaml"
        # Every change is a read-modify-write of the whole file: one at a time.
        self._lock = asyncio.Lock()

    def _read(self) -> list[dict[str, object]]:
        if not self._path.exists():
            return []
        with self._path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        return [item for item in data if isinstance(item, dict)] if isinstance(data, list) else []

    def _write(self, items: list[dict[str, object]]) -> None:
        tmp = self._path.with_suffix(".yaml.tmp")
        with tmp.open("w", encoding="utf-8") as f:
            yaml.safe_dump(items, f, allow_unicode=True, sort_keys=False)
        os.replace(tmp, self._path)

    def _load_all(self) -> list[ReviewPreset]:
        presets: list[ReviewPreset] = []
        for item in self._read():
            try:
                presets.append(_preset_from_dict(item))
            except (KeyError, TypeError, ValueError):
                _log.warning("Skipping an unreadable review preset %r", item.get("id"))
        return presets

    async def create(
        self,
        name: str,
        description: str,
        instructions: str,
        brief_config: dict[str, object],
    ) -> ReviewPreset:
        now = _now_utc()
        preset = ReviewPreset(
            id=uuid4(),
            name=name,
            description=description,
            instructions=instructions,
            brief_config=brief_config,
            created_at=now,
            updated_at=now,
        )

        def _sync() -> None:
            items = self._read()
            _ensure_name_free(items, name, except_id=None)
            items.append(_preset_to_dict(preset))
            self._write(items)

        async with self._lock:
            await asyncio.to_thread(_sync)
        return preset

    async def get_by_id(self, preset_id: UUID) -> ReviewPreset | None:
        presets = await asyncio.to_thread(self._load_all)
        return next((p for p in presets if p.id == preset_id), None)

    async def list_all(self) -> list[ReviewPreset]:
        presets = await asyncio.to_thread(self._load_all)
        return sorted(presets, key=lambda p: p.created_at)

    async def update(
        self,
        preset_id: UUID,
        *,
        name: str | None = None,
        description: str | None = None,
        instructions: str | None = None,
        brief_config: dict[str, object] | None = None,
    ) -> ReviewPreset:
        changes: dict[str, object] = {
            key: value
            for key, value in (
                ("name", name),
                ("description", description),
                ("instructions", instructions),
                ("brief_config", brief_config),
            )
            if value is not None
        }

        def _sync() -> ReviewPreset:
            items = self._read()
            index = next((i for i, item in enumerate(items) if str(item.get("id")) == str(preset_id)), None)
            if index is None:
                raise ReviewPresetNotFoundError(f"Review preset {preset_id} not found")
            if name is not None:
                _ensure_name_free(items, name, except_id=preset_id)
            current = _preset_from_dict(items[index])
            updated = current.model_copy(update={**changes, "updated_at": _now_utc()})
            items[index] = _preset_to_dict(updated)
            self._write(items)
            return updated

        async with self._lock:
            return await asyncio.to_thread(_sync)

    async def delete(self, preset_id: UUID) -> bool:
        def _sync() -> bool:
            items = self._read()
            remaining = [item for item in items if str(item.get("id")) != str(preset_id)]
            if len(remaining) == len(items):
                return False
            self._write(remaining)
            return True

        async with self._lock:
            return await asyncio.to_thread(_sync)
