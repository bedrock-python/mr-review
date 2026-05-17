from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

import yaml

from mr_review.core.ai_providers.entities import AIProvider, AIProviderType
from mr_review.infra.utils import now_utc as _now_utc


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


class FileAIProviderRepository:
    def __init__(self, data_dir: Path) -> None:
        self._path = data_dir / "ai_providers.yaml"

    def _read(self) -> list[dict[str, object]]:
        if not self._path.exists():
            return []
        with self._path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        if data is None:
            return []
        return data if isinstance(data, list) else []

    def _write(self, providers: list[dict[str, object]]) -> None:
        tmp = self._path.with_suffix(".yaml.tmp")
        with tmp.open("w", encoding="utf-8") as f:
            yaml.safe_dump(providers, f, allow_unicode=True, sort_keys=False)
        os.replace(tmp, self._path)

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

        def _sync() -> None:
            items = self._read()
            items.append(_ai_provider_to_dict(provider))
            self._write(items)

        await asyncio.to_thread(_sync)
        return provider

    async def get_by_id(self, provider_id: UUID) -> AIProvider | None:
        def _sync() -> AIProvider | None:
            items = self._read()
            for data in items:
                if str(data["id"]) == str(provider_id):
                    return _ai_provider_from_dict(data)
            return None

        return await asyncio.to_thread(_sync)

    async def list_all(self) -> list[AIProvider]:
        def _sync() -> list[AIProvider]:
            items = self._read()
            entities = [_ai_provider_from_dict(d) for d in items]
            return sorted(entities, key=lambda p: p.created_at)

        return await asyncio.to_thread(_sync)

    def _apply_update(
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
        def _sync() -> AIProvider | None:
            items = self._read()
            for data in items:
                if str(data["id"]) == str(provider_id):
                    self._apply_update(
                        data,
                        name,
                        api_key,
                        base_url,
                        models,
                        ssl_verify,
                        timeout,
                        max_concurrent,
                        clear_max_concurrent,
                    )
                    self._write(items)
                    return _ai_provider_from_dict(data)
            return None

        return await asyncio.to_thread(_sync)

    async def delete(self, provider_id: UUID) -> bool:
        def _sync() -> bool:
            items = self._read()
            new_items = [d for d in items if str(d["id"]) != str(provider_id)]
            if len(new_items) == len(items):
                return False
            self._write(new_items)
            return True

        return await asyncio.to_thread(_sync)
