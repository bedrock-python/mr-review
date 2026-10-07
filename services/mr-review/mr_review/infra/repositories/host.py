from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import TypeVar
from uuid import UUID, uuid4

from mr_review.core.hosts.entities import Host
from mr_review.infra.repositories.file_store import (
    KeyedLock,
    dump_yaml,
    load_yaml,
    restrict_file_permissions,
    write_file_atomically,
)
from mr_review.infra.utils import now_utc as _now_utc

_T = TypeVar("_T")
_Rows = list[dict[str, object]]
# All hosts live in one file, so a single lock key serialises every write to it.
_FILE_LOCK_KEY = "hosts.yaml"


def _host_from_dict(data: dict[str, object]) -> Host:
    created_at = datetime.fromisoformat(str(data["created_at"]))
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    raw_color = data.get("color")
    raw_favs = data.get("favourite_repos")
    favourite_repos: list[str] = [str(p) for p in raw_favs] if isinstance(raw_favs, list) else []
    return Host(
        id=UUID(str(data["id"])),
        name=str(data["name"]),
        type=str(data["type"]),
        base_url=str(data["base_url"]),
        token=str(data["token"]),
        color=str(raw_color) if raw_color is not None else None,
        favourite_repos=favourite_repos,
        timeout=int(str(data.get("timeout", 30))),
        created_at=created_at,
    )


def _host_to_dict(host: Host) -> dict[str, object]:
    return {
        "id": str(host.id),
        "name": host.name,
        "type": host.type,
        "base_url": host.base_url,
        "token": host.token.get_secret_value(),
        "color": host.color,
        "favourite_repos": host.favourite_repos,
        "timeout": host.timeout,
        "created_at": host.created_at.isoformat(),
    }


def _index_of(rows: _Rows, host_id: UUID) -> int | None:
    key = str(host_id)
    return next((i for i, row in enumerate(rows) if str(row.get("id")) == key), None)


class FileHostRepository:
    """Hosts stored as a list in ``hosts.yaml``.

    Reads see a complete file at all times (writes are atomic renames); writes are
    serialised by one lock, and every read-modify-write runs under it.
    """

    def __init__(self, data_dir: Path) -> None:
        self._path = data_dir / "hosts.yaml"
        self._lock: KeyedLock[str] = KeyedLock()
        # The file holds tokens; tighten files written by versions that did not.
        restrict_file_permissions(self._path)

    def _read(self) -> _Rows:
        try:
            content = self._path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return []
        data = load_yaml(content)
        return data if isinstance(data, list) else []

    def _write(self, hosts: _Rows) -> None:
        write_file_atomically(self._path, dump_yaml(hosts))

    async def _modify(self, change: Callable[[_Rows], tuple[_T, bool]]) -> _T:
        """Read all rows, let ``change`` edit them in place, and write them back if it says so."""

        async def _operation() -> _T:
            rows = await asyncio.to_thread(self._read)
            result, changed = change(rows)
            if changed:
                await asyncio.to_thread(self._write, rows)
            return result

        return await self._lock.run(_FILE_LOCK_KEY, _operation)

    async def create(
        self,
        name: str,
        type_: str,
        base_url: str,
        token: str,
        color: str | None = None,
        timeout: int = 30,
    ) -> Host:
        host = Host(
            id=uuid4(),
            name=name,
            type=type_,
            base_url=base_url,
            token=token,
            color=color,
            timeout=timeout,
            created_at=_now_utc(),
        )

        def _append(rows: _Rows) -> tuple[None, bool]:
            rows.append(_host_to_dict(host))
            return None, True

        await self._modify(_append)
        return host

    async def get_by_id(self, host_id: UUID) -> Host | None:
        def _sync() -> Host | None:
            rows = self._read()
            index = _index_of(rows, host_id)
            return _host_from_dict(rows[index]) if index is not None else None

        return await asyncio.to_thread(_sync)

    async def list_all(self) -> list[Host]:
        def _sync() -> list[Host]:
            entities = [_host_from_dict(d) for d in self._read()]
            return sorted(entities, key=lambda h: h.created_at)

        return await asyncio.to_thread(_sync)

    def _build_patches(
        self,
        name: str | None,
        base_url: str | None,
        token: str | None,
        color: str | None,
        timeout: int | None,
    ) -> dict[str, object]:
        patches: dict[str, object] = {}
        if name is not None:
            patches["name"] = name
        if base_url is not None:
            patches["base_url"] = base_url
        if token is not None:
            patches["token"] = token
        if color is not None:
            patches["color"] = color
        if timeout is not None:
            patches["timeout"] = timeout
        return patches

    async def _patch(self, host_id: UUID, patches: dict[str, object]) -> Host | None:
        def _apply(rows: _Rows) -> tuple[Host | None, bool]:
            index = _index_of(rows, host_id)
            if index is None:
                return None, False
            rows[index].update(patches)
            return _host_from_dict(rows[index]), True

        return await self._modify(_apply)

    async def update(
        self,
        host_id: UUID,
        name: str | None = None,
        base_url: str | None = None,
        token: str | None = None,
        color: str | None = None,
        timeout: int | None = None,
    ) -> Host | None:
        return await self._patch(host_id, self._build_patches(name, base_url, token, color, timeout))

    async def set_favourite_repos(self, host_id: UUID, repo_paths: list[str]) -> Host | None:
        return await self._patch(host_id, {"favourite_repos": list(repo_paths)})

    async def update_with(self, host_id: UUID, change: Callable[[Host], Host]) -> Host | None:
        def _existing_only(current: Host | None) -> Host | None:
            return change(current) if current is not None else None

        return await self.upsert_with(host_id, _existing_only)

    async def upsert_with(self, host_id: UUID, change: Callable[[Host | None], Host | None]) -> Host | None:
        def _apply(rows: _Rows) -> tuple[Host | None, bool]:
            index = _index_of(rows, host_id)
            current = _host_from_dict(rows[index]) if index is not None else None
            updated = change(current)
            if updated is None or updated is current:
                return current, False
            if updated.id != host_id:
                raise ValueError(f"A change to host {host_id} must not alter its id")
            if index is None:
                rows.append(_host_to_dict(updated))
            else:
                # Merge rather than replace so keys written by a newer version survive.
                rows[index] = {**rows[index], **_host_to_dict(updated)}
            return updated, True

        return await self._modify(_apply)

    async def delete(self, host_id: UUID) -> bool:
        def _remove(rows: _Rows) -> tuple[bool, bool]:
            index = _index_of(rows, host_id)
            if index is None:
                return False, False
            del rows[index]
            return True, True

        return await self._modify(_remove)
