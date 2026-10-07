"""HTTP contract of /api/v1/data: status codes, secret handling and the import preview."""

from __future__ import annotations

import logging
import threading
from collections.abc import AsyncGenerator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from pathlib import Path
from typing import Any

import pytest
from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from mr_review.api.config import Settings
from mr_review.api.routers.v1.ai_providers import router as ai_providers_router
from mr_review.api.routers.v1.export_import import router as export_import_router
from mr_review.api.routers.v1.hosts import router as hosts_router
from mr_review.api.routers.v1.reviews import router as reviews_router
from mr_review.core.export_import import encryption
from mr_review.infra.di.containers.api import create_api_container

pytestmark = [pytest.mark.integration, pytest.mark.http]

_TOKEN = "glpat-SECRET-TOKEN"  # noqa: S105
_API_KEY = "sk-SECRET-KEY"
_PASSPHRASE = "correct horse battery staple"  # noqa: S105

ClientFactory = Callable[[str], AbstractAsyncContextManager[AsyncClient]]


@pytest.fixture
def instance(tmp_path: Path) -> ClientFactory:
    """Open a client on a fresh mr-review instance with its own data directory."""

    @asynccontextmanager
    async def _open(name: str) -> AsyncGenerator[AsyncClient, None]:
        app = FastAPI()
        for router in (hosts_router, ai_providers_router, reviews_router, export_import_router):
            app.include_router(router)
        container = create_api_container(Settings(data_dir=tmp_path / name))
        setup_dishka(container, app)
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                yield client
        finally:
            await container.close()

    return _open


async def _populate(client: AsyncClient) -> dict[str, Any]:
    host = (
        await client.post(
            "/api/v1/hosts",
            json={"name": "gl", "type": "gitlab", "base_url": "https://gl.example", "token": _TOKEN},
        )
    ).json()
    await client.post(f"/api/v1/hosts/{host['id']}/favourite-repos/grp/repo")
    await client.post(
        "/api/v1/ai-providers",
        json={"name": "oa", "type": "openai", "api_key": _API_KEY, "models": ["gpt-4o"], "max_concurrent": 2},
    )
    review = (
        await client.post("/api/v1/reviews", json={"host_id": host["id"], "repo_path": "grp/repo", "mr_iid": 7})
    ).json()
    brief = {"preset": "security", "custom_instructions": "Look for SQL injection"}
    patched = await client.patch(f"/api/v1/reviews/{review['id']}", json={"brief_config": brief})
    assert patched.json()["iterations"][0]["brief_config"]["preset"] == "security"
    return host


async def _state(client: AsyncClient) -> tuple[Any, Any, Any]:
    return (
        (await client.get("/api/v1/hosts")).json(),
        (await client.get("/api/v1/ai-providers")).json(),
        (await client.get("/api/v1/reviews")).json(),
    )


async def test__export__no_secret_option__leaves_secrets_out(instance: ClientFactory) -> None:
    async with instance("a") as client:
        await _populate(client)

        response = await client.post("/api/v1/data/export", json={})

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["secrets"] == "omitted"
    assert body["encrypted"] is False
    assert [h["token"] for h in body["hosts"]] == [None]
    assert [p["api_key"] for p in body["ai_providers"]] == [None]
    assert _TOKEN not in response.text
    assert _API_KEY not in response.text


async def test__export__plain_secrets_opt_in__includes_them(instance: ClientFactory) -> None:
    async with instance("a") as client:
        await _populate(client)

        body = (await client.post("/api/v1/data/export", json={"include_plain_secrets": True})).json()

    assert body["secrets"] == "plain"
    assert [h["token"] for h in body["hosts"]] == [_TOKEN]
    assert [p["api_key"] for p in body["ai_providers"]] == [_API_KEY]


async def test__export__encrypted__carries_one_key_block_and_no_plain_secret(instance: ClientFactory) -> None:
    async with instance("a") as client:
        await _populate(client)

        response = await client.post("/api/v1/data/export", json={"encryption_password": _PASSPHRASE})

    body = response.json()
    assert body["version"] == "2.0"
    assert body["secrets"] == "encrypted"
    assert body["encryption"]["kdf"] == "pbkdf2-sha256"
    assert body["encryption"]["iterations"] >= 600_000
    assert _TOKEN not in response.text
    assert _API_KEY not in response.text


@pytest.mark.parametrize(
    "payload",
    [
        {"encryption_password": _PASSPHRASE, "include_plain_secrets": True},
        {"encryption_password": ""},
    ],
)
async def test__export__contradictory_or_empty_password__is_422(
    instance: ClientFactory, payload: dict[str, Any]
) -> None:
    async with instance("a") as client:
        response = await client.post("/api/v1/data/export", json=payload)

    assert response.status_code == 422
    assert _PASSPHRASE not in response.text


async def test__import__round_trip_between_instances__keeps_ids_secrets_and_favourites(
    instance: ClientFactory,
) -> None:
    async with instance("a") as source:
        await _populate(source)
        package = (await source.post("/api/v1/data/export", json={"encryption_password": _PASSPHRASE})).json()
        expected = await _state(source)

    async with instance("b") as target:
        first = await target.post(
            "/api/v1/data/import", json={**package, "merge_strategy": "skip", "decryption_password": _PASSPHRASE}
        )
        second = await target.post(
            "/api/v1/data/import", json={**package, "merge_strategy": "merge", "decryption_password": _PASSPHRASE}
        )
        actual = await _state(target)

    assert first.status_code == 201
    assert first.json()["hosts_imported"] == 1
    assert second.status_code == 201
    assert second.json()["hosts_skipped"] == 1
    assert actual == expected


async def test__import__wrong_passphrase__is_one_400_and_writes_nothing(instance: ClientFactory) -> None:
    async with instance("a") as client:
        await _populate(client)
        package = (await client.post("/api/v1/data/export", json={"encryption_password": _PASSPHRASE})).json()
        before = await _state(client)

        response = await client.post(
            "/api/v1/data/import", json={**package, "merge_strategy": "replace", "decryption_password": "wrong"}
        )

        assert response.status_code == 400
        assert response.json() == {"detail": "Wrong passphrase: it does not decrypt this file."}
        assert await _state(client) == before


async def test__import__encrypted_file_without_passphrase__is_400(instance: ClientFactory) -> None:
    async with instance("a") as client:
        await _populate(client)
        package = (await client.post("/api/v1/data/export", json={"encryption_password": _PASSPHRASE})).json()

        response = await client.post("/api/v1/data/import", json={**package, "merge_strategy": "skip"})

    assert response.status_code == 400
    assert "passphrase" in response.json()["detail"]


async def test__import__malformed_record__is_422_without_echoing_the_token(
    instance: ClientFactory, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)
    package = {
        "version": "1.0",
        "exported_at": "2026-01-01T00:00:00Z",
        "encrypted": False,
        "hosts": [
            {"id": "00000000-0000-0000-0000-000000000001", "type": "gitlab-ce", "base_url": "x", "token": _TOKEN},
        ],
    }

    async with instance("a") as client:
        response = await client.post("/api/v1/data/import", json=package)
        preview = await client.post("/api/v1/data/import/preview", json=package)

    for result in (response, preview):
        assert result.status_code == 422
        assert _TOKEN not in result.text
        assert {tuple(e["loc"]) for e in result.json()["detail"]} >= {("body", "hosts", 0, "type")}
    assert _TOKEN not in caplog.text


async def test__import__not_an_export_file__is_422(instance: ClientFactory) -> None:
    async with instance("a") as client:
        response = await client.post("/api/v1/data/import", json={"hello": "world"})

    assert response.status_code == 422


async def test__import_preview__reports_counts_and_overlap(instance: ClientFactory) -> None:
    async with instance("a") as source:
        await _populate(source)
        package = (await source.post("/api/v1/data/export", json={"encryption_password": _PASSPHRASE})).json()

    async with instance("b") as target:
        empty = (await target.post("/api/v1/data/import/preview", json=package)).json()
        await target.post(
            "/api/v1/data/import", json={**package, "merge_strategy": "skip", "decryption_password": _PASSPHRASE}
        )
        overlapping = (await target.post("/api/v1/data/import/preview", json=package)).json()
        reviews_only = (
            await target.post("/api/v1/data/import/preview", json={**package, "hosts": [], "ai_providers": []})
        ).json()

    assert empty["encrypted"] is True
    assert empty["secrets"] == "encrypted"
    assert empty["hosts"] == {"total": 1, "existing": 0}
    assert empty["ai_providers"] == {"total": 1, "existing": 0}
    assert empty["reviews"] == {"total": 1, "existing": 0}
    assert empty["reviews_without_host"] == 0
    assert overlapping["hosts"] == {"total": 1, "existing": 1}
    assert overlapping["reviews"] == {"total": 1, "existing": 1}
    assert reviews_only["reviews_without_host"] == 0  # the host already exists here


async def test__import_preview__review_whose_host_is_nowhere__is_flagged(instance: ClientFactory) -> None:
    async with instance("a") as source:
        await _populate(source)
        package = (await source.post("/api/v1/data/export", json={})).json()

    async with instance("b") as target:
        preview = (await target.post("/api/v1/data/import/preview", json={**package, "hosts": []})).json()

    assert preview["reviews_without_host"] == 1
    assert preview["secrets"] == "omitted"


async def test__export__more_reviews_than_the_history_page__exports_all(instance: ClientFactory) -> None:
    async with instance("a") as client:
        host = await _populate(client)
        for mr_iid in range(100, 155):
            await client.post(
                "/api/v1/reviews", json={"host_id": host["id"], "repo_path": "grp/repo", "mr_iid": mr_iid}
            )

        body = (await client.post("/api/v1/data/export", json={"include_hosts": False})).json()

    assert len(body["reviews"]) == 56


async def test__export_and_import__derive_one_key_per_file_off_the_event_loop(
    instance: ClientFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    on_event_loop_thread: list[bool] = []
    real_derive = encryption._derive_key

    def recording_derive(*args: Any, **kwargs: Any) -> bytes:
        on_event_loop_thread.append(threading.current_thread() is threading.main_thread())
        return real_derive(*args, **kwargs)

    monkeypatch.setattr(encryption, "_derive_key", recording_derive)
    async with instance("a") as source:
        await _populate(source)
        await source.post(
            "/api/v1/hosts", json={"name": "gh", "type": "github", "base_url": "https://api.github.com", "token": "t"}
        )
        package = (await source.post("/api/v1/data/export", json={"encryption_password": _PASSPHRASE})).json()

    async with instance("b") as target:
        response = await target.post(
            "/api/v1/data/import", json={**package, "merge_strategy": "skip", "decryption_password": _PASSPHRASE}
        )

    assert response.status_code == 201
    assert on_event_loop_thread == [False, False]  # one derivation per file, never on the event loop
