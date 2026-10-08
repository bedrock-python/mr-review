from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import TypeVar
from uuid import UUID, uuid4

from mr_review.core.review_presets.entities import (
    ReviewPreset,
    ReviewPresetNameTakenError,
    ReviewPresetNotFoundError,
)
from mr_review.core.reviews.entities import normalize_brief_overrides
from mr_review.infra.repositories.file_store import KeyedLock, dump_yaml, load_yaml, write_file_atomically
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


_T = TypeVar("_T")
_Rows = list[dict[str, object]]
# All presets live in one file, so a single lock key serialises every write to it.
_FILE_LOCK_KEY = "review_presets.yaml"


def _index_of(items: _Rows, preset_id: UUID) -> int | None:
    key = str(preset_id)
    return next((i for i, item in enumerate(items) if str(item.get("id")) == key), None)


class FileReviewPresetRepository:
    """Saved review presets in ``review_presets.yaml`` under the data directory.

    Reads see a complete file at all times (writes are atomic renames); writes are
    serialised by one lock, and every read-modify-write — the name check included — runs
    under it.
    """

    def __init__(self, data_dir: Path) -> None:
        self._path = data_dir / "review_presets.yaml"
        self._lock: KeyedLock[str] = KeyedLock()

    def _read(self) -> _Rows:
        try:
            content = self._path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return []
        data = load_yaml(content)
        return [item for item in data if isinstance(item, dict)] if isinstance(data, list) else []

    def _write(self, items: _Rows) -> None:
        write_file_atomically(self._path, dump_yaml(items))

    def _load_all(self) -> list[ReviewPreset]:
        presets: list[ReviewPreset] = []
        for item in self._read():
            try:
                presets.append(_preset_from_dict(item))
            except (KeyError, TypeError, ValueError):
                _log.warning("Skipping an unreadable review preset %r", item.get("id"))
        return presets

    async def _modify(self, change: Callable[[_Rows], tuple[_T, bool]]) -> _T:
        """Read all rows, let ``change`` edit them in place, and write them back if it says so."""

        async def _operation() -> _T:
            items = await asyncio.to_thread(self._read)
            result, changed = change(items)
            if changed:
                await asyncio.to_thread(self._write, items)
            return result

        return await self._lock.run(_FILE_LOCK_KEY, _operation)

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

        def _append(items: _Rows) -> tuple[None, bool]:
            _ensure_name_free(items, name, except_id=None)
            items.append(_preset_to_dict(preset))
            return None, True

        await self._modify(_append)
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

        def _apply(items: _Rows) -> tuple[ReviewPreset, bool]:
            index = _index_of(items, preset_id)
            if index is None:
                raise ReviewPresetNotFoundError(f"Review preset {preset_id} not found")
            if name is not None:
                _ensure_name_free(items, name, except_id=preset_id)
            current = _preset_from_dict(items[index])
            updated = current.model_copy(update={**changes, "updated_at": _now_utc()})
            items[index] = _preset_to_dict(updated)
            return updated, True

        return await self._modify(_apply)

    async def upsert_with(
        self, preset_id: UUID, change: Callable[[ReviewPreset | None], ReviewPreset | None]
    ) -> ReviewPreset | None:
        def _apply(items: _Rows) -> tuple[ReviewPreset | None, bool]:
            index = _index_of(items, preset_id)
            current = _preset_from_dict(items[index]) if index is not None else None
            updated = change(current)
            if updated is None or updated is current:
                return current, False
            if updated.id != preset_id:
                raise ValueError(f"A change to review preset {preset_id} must not alter its id")
            _ensure_name_free(items, updated.name, except_id=preset_id)
            if index is None:
                items.append(_preset_to_dict(updated))
            else:
                # Merge rather than replace so keys written by a newer version survive.
                items[index] = {**items[index], **_preset_to_dict(updated)}
            return updated, True

        return await self._modify(_apply)

    async def delete(self, preset_id: UUID) -> bool:
        def _remove(items: _Rows) -> tuple[bool, bool]:
            index = _index_of(items, preset_id)
            if index is None:
                return False, False
            del items[index]
            return True, True

        return await self._modify(_remove)
