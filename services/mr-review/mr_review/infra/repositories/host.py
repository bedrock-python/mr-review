from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

import yaml

from mr_review.core.hosts.entities import Host


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


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
        "token": host.token,
        "color": host.color,
        "favourite_repos": host.favourite_repos,
        "timeout": host.timeout,
        "created_at": host.created_at.isoformat(),
    }


class FileHostRepository:
    def __init__(self, data_dir: Path) -> None:
        self._path = data_dir / "hosts.yaml"

    def _read(self) -> list[dict[str, object]]:
        if not self._path.exists():
            return []
        with self._path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        if data is None:
            return []
        return data if isinstance(data, list) else []

    def _write(self, hosts: list[dict[str, object]]) -> None:
        tmp = self._path.with_suffix(".yaml.tmp")
        with tmp.open("w", encoding="utf-8") as f:
            yaml.safe_dump(hosts, f, allow_unicode=True, sort_keys=False)
        os.replace(tmp, self._path)

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

        def _sync() -> None:
            hosts = self._read()
            hosts.append(_host_to_dict(host))
            self._write(hosts)

        await asyncio.to_thread(_sync)
        return host

    async def get_by_id(self, host_id: UUID) -> Host | None:
        def _sync() -> Host | None:
            hosts = self._read()
            for data in hosts:
                if str(data["id"]) == str(host_id):
                    return _host_from_dict(data)
            return None

        return await asyncio.to_thread(_sync)

    async def list_all(self) -> list[Host]:
        def _sync() -> list[Host]:
            hosts = self._read()
            entities = [_host_from_dict(d) for d in hosts]
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

    async def update(
        self,
        host_id: UUID,
        name: str | None = None,
        base_url: str | None = None,
        token: str | None = None,
        color: str | None = None,
        timeout: int | None = None,
    ) -> Host | None:
        patches = self._build_patches(name, base_url, token, color, timeout)

        def _sync() -> Host | None:
            hosts = self._read()
            for data in hosts:
                if str(data["id"]) == str(host_id):
                    data.update(patches)
                    self._write(hosts)
                    return _host_from_dict(data)
            return None

        return await asyncio.to_thread(_sync)

    async def set_favourite_repos(self, host_id: UUID, repo_paths: list[str]) -> Host | None:
        def _sync() -> Host | None:
            hosts = self._read()
            for data in hosts:
                if str(data["id"]) == str(host_id):
                    data["favourite_repos"] = repo_paths
                    self._write(hosts)
                    return _host_from_dict(data)
            return None

        return await asyncio.to_thread(_sync)

    async def delete(self, host_id: UUID) -> bool:
        def _sync() -> bool:
            hosts = self._read()
            new_hosts = [d for d in hosts if str(d["id"]) != str(host_id)]
            if len(new_hosts) == len(hosts):
                return False
            self._write(new_hosts)
            return True

        return await asyncio.to_thread(_sync)
