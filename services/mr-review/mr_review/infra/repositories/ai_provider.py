from __future__ import annotations

import asyncio
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import TypeVar
from uuid import UUID, uuid4

from mr_review.core.ai_providers.entities import AIProvider, AIProviderType
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
# All providers live in one file, so a single lock key serialises every write to it.
_FILE_LOCK_KEY = "ai_providers.yaml"


def _ai_provider_from_dict(data: dict[str, object]) -> AIProvider:
    created_at = datetime.fromisoformat(str(data["created_at"]))
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    models = data.get("models", [])
    raw_timeout = data.get("timeout", 60)
    timeout = int(str(raw_timeout)) if raw_timeout is not None else 60
    raw_max_concurrent = data.get("max_concurrent")
    max_concurrent = int(str(raw_max_concurrent)) if raw_max_concurrent is not None else None
    return AIProvider(
        id=UUID(str(data["id"])),
        name=str(data["name"]),
        type=str(data["type"]),
        api_key=str(data["api_key"]),
        base_url=str(data.get("base_url", "")),
        models=[str(m) for m in models] if isinstance(models, list) else [],
        ssl_verify=bool(data.get("ssl_verify", True)),
        timeout=timeout,
        created_at=created_at,
        max_concurrent=max_concurrent,
    )


def _ai_provider_to_dict(provider: AIProvider) -> dict[str, object]:
    data: dict[str, object] = {
        "id": str(provider.id),
        "name": provider.name,
        "type": provider.type,
        "api_key": provider.api_key.get_secret_value(),
        "base_url": provider.base_url,
        "models": list(provider.models),
        "ssl_verify": provider.ssl_verify,
        "timeout": provider.timeout,
        "created_at": provider.created_at.isoformat(),
    }
    if provider.max_concurrent is not None:
        data["max_concurrent"] = provider.max_concurrent
    return data


def _index_of(rows: _Rows, provider_id: UUID) -> int | None:
    key = str(provider_id)
    return next((i for i, row in enumerate(rows) if str(row.get("id")) == key), None)


class FileAIProviderRepository:
    """AI providers stored as a list in ``ai_providers.yaml``.

    Reads see a complete file at all times (writes are atomic renames); writes are
    serialised by one lock, and every read-modify-write runs under it.
    """

    def __init__(self, data_dir: Path) -> None:
        self._path = data_dir / "ai_providers.yaml"
        self._lock: KeyedLock[str] = KeyedLock()
        # The file holds API keys; tighten files written by versions that did not.
        restrict_file_permissions(self._path)

    def _read(self) -> _Rows:
        try:
            content = self._path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return []
        data = load_yaml(content)
        return data if isinstance(data, list) else []

    def _write(self, providers: _Rows) -> None:
        write_file_atomically(self._path, dump_yaml(providers))

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
        type_: AIProviderType,
        api_key: str,
        base_url: str,
        models: list[str],
        ssl_verify: bool = True,
        timeout: int = 60,
        max_concurrent: int | None = None,
    ) -> AIProvider:
        provider = AIProvider(
            id=uuid4(),
            name=name,
            type=type_,
            api_key=api_key,
            base_url=base_url,
            models=models,
            ssl_verify=ssl_verify,
            timeout=timeout,
            max_concurrent=max_concurrent,
            created_at=_now_utc(),
        )

        def _append(rows: _Rows) -> tuple[None, bool]:
            rows.append(_ai_provider_to_dict(provider))
            return None, True

        await self._modify(_append)
        return provider

    async def get_by_id(self, provider_id: UUID) -> AIProvider | None:
        def _sync() -> AIProvider | None:
            rows = self._read()
            index = _index_of(rows, provider_id)
            return _ai_provider_from_dict(rows[index]) if index is not None else None

        return await asyncio.to_thread(_sync)

    async def list_all(self) -> list[AIProvider]:
        def _sync() -> list[AIProvider]:
            entities = [_ai_provider_from_dict(d) for d in self._read()]
            return sorted(entities, key=lambda p: p.created_at)

        return await asyncio.to_thread(_sync)

    def _apply_update(  # noqa: C901
        self,
        data: dict[str, object],
        name: str | None,
        api_key: str | None,
        base_url: str | None,
        models: list[str] | None,
        ssl_verify: bool | None,
        timeout: int | None,
        max_concurrent: int | None,
        clear_max_concurrent: bool,
    ) -> None:
        if name is not None:
            data["name"] = name
        if api_key is not None:
            data["api_key"] = api_key
        if base_url is not None:
            data["base_url"] = base_url
        if models is not None:
            data["models"] = list(models)
        if ssl_verify is not None:
            data["ssl_verify"] = ssl_verify
        if timeout is not None:
            data["timeout"] = timeout
        if max_concurrent is not None:
            data["max_concurrent"] = max_concurrent
        elif clear_max_concurrent:
            data.pop("max_concurrent", None)

    async def update(
        self,
        provider_id: UUID,
        name: str | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
        models: list[str] | None = None,
        ssl_verify: bool | None = None,
        timeout: int | None = None,
        max_concurrent: int | None = None,
        clear_max_concurrent: bool = False,
    ) -> AIProvider | None:
        def _apply(rows: _Rows) -> tuple[AIProvider | None, bool]:
            index = _index_of(rows, provider_id)
            if index is None:
                return None, False
            self._apply_update(
                rows[index],
                name,
                api_key,
                base_url,
                models,
                ssl_verify,
                timeout,
                max_concurrent,
                clear_max_concurrent,
            )
            return _ai_provider_from_dict(rows[index]), True

        return await self._modify(_apply)

    async def update_with(self, provider_id: UUID, change: Callable[[AIProvider], AIProvider]) -> AIProvider | None:
        def _existing_only(current: AIProvider | None) -> AIProvider | None:
            return change(current) if current is not None else None

        return await self.upsert_with(provider_id, _existing_only)

    async def upsert_with(
        self, provider_id: UUID, change: Callable[[AIProvider | None], AIProvider | None]
    ) -> AIProvider | None:
        def _apply(rows: _Rows) -> tuple[AIProvider | None, bool]:
            index = _index_of(rows, provider_id)
            current = _ai_provider_from_dict(rows[index]) if index is not None else None
            updated = change(current)
            if updated is None or updated is current:
                return current, False
            if updated.id != provider_id:
                raise ValueError(f"A change to AI provider {provider_id} must not alter its id")
            new_row = _ai_provider_to_dict(updated)
            if index is None:
                rows.append(new_row)
                return updated, True
            # Merge rather than replace so keys written by a newer version survive;
            # an unset concurrency cap is stored as an absent key.
            merged = {**rows[index], **new_row}
            if updated.max_concurrent is None:
                merged.pop("max_concurrent", None)
            rows[index] = merged
            return updated, True

        return await self._modify(_apply)

    async def delete(self, provider_id: UUID) -> bool:
        def _remove(rows: _Rows) -> tuple[bool, bool]:
            index = _index_of(rows, provider_id)
            if index is None:
                return False, False
            del rows[index]
            return True, True

        return await self._modify(_remove)
