"""The API answers only the host names it is meant to be reached by (DNS-rebinding guard).

A page on a domain the attacker re-points at 127.0.0.1 can make the browser talk to the
loopback-bound API, but the request still carries the attacker's host name.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator, Callable
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from mr_review.api import entrypoint
from mr_review.api.config import Settings
from pydantic import ValidationError

pytestmark = [pytest.mark.integration, pytest.mark.http]

_LIVEZ = "/system/health/livez"

AppFactory = Callable[[str | None], FastAPI]


@pytest.fixture
def make_app(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> AppFactory:
    """Build the real application, optionally with ``MR_REVIEW__ALLOWED_HOSTS`` set."""
    monkeypatch.setenv("MR_REVIEW__DATA_DIR", str(tmp_path))
    monkeypatch.setattr(entrypoint, "configure_logging", lambda **_: None)

    def build(allowed_hosts: str | None) -> FastAPI:
        if allowed_hosts is None:
            monkeypatch.delenv("MR_REVIEW__ALLOWED_HOSTS", raising=False)
        else:
            monkeypatch.setenv("MR_REVIEW__ALLOWED_HOSTS", allowed_hosts)
        return entrypoint.create_app()

    return build


@pytest_asyncio.fixture
async def default_client(make_app: AppFactory) -> AsyncGenerator[AsyncClient, None]:
    async with AsyncClient(transport=ASGITransport(app=make_app(None)), base_url="http://localhost") as ac:
        yield ac


@pytest.mark.parametrize("host", ["localhost", "localhost:17240", "127.0.0.1:8000", "[::1]:8000", "api:8000"])
async def test__default_allowlist__local_and_service_names__are_served(default_client: AsyncClient, host: str) -> None:
    """Loopback names, with or without a port, and the compose service name reach the API."""
    response = await default_client.get(_LIVEZ, headers={"host": host})

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize(
    ("method", "path"), [("GET", _LIVEZ), ("GET", "/api/v1/hosts"), ("POST", "/api/v1/data/export")]
)
async def test__default_allowlist__foreign_host__returns_400(
    default_client: AsyncClient, method: str, path: str
) -> None:
    """A rebound domain is refused before any route runs — the data export included."""
    response = await default_client.request(method, path, json={}, headers={"host": "attacker.example:17240"})

    assert response.status_code == 400
    assert "MR_REVIEW__ALLOWED_HOSTS" in response.text


async def test__refused_host__400_names_the_host_to_allow(default_client: AsyncClient) -> None:
    """The message names the refused host without its port — the value the setting takes."""
    response = await default_client.get(_LIVEZ, headers={"host": "Review.LAN:17240"})

    assert response.status_code == 400
    assert "'review.lan'" in response.text
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-type"].startswith("text/plain")


async def test__refused_host__markup_in_the_header__is_not_echoed(default_client: AsyncClient) -> None:
    """Only host-name characters of the header reach the body."""
    response = await default_client.get(_LIVEZ, headers={"host": "<script>x</script>.example"})

    assert response.status_code == 400
    assert "<" not in response.text
    assert ">" not in response.text


async def test__proxy_upstream_name__refused_until_allowed(make_app: AppFactory) -> None:
    """A proxy that does not forward Host sends its upstream's name; allowing that name works."""
    refused_app = make_app(None)
    async with AsyncClient(transport=ASGITransport(app=refused_app), base_url="http://localhost") as client:
        refused = await client.get(_LIVEZ, headers={"host": "mr-review:8000"})

    allowed_app = make_app("localhost,mr-review")
    async with AsyncClient(transport=ASGITransport(app=allowed_app), base_url="http://localhost") as client:
        allowed = await client.get(_LIVEZ, headers={"host": "mr-review:8000"})

    assert refused.status_code == 400
    assert "'mr-review'" in refused.text
    assert allowed.status_code == 200


async def test__configured_allowlist__lan_address__is_served_and_loopback_still_works(make_app: AppFactory) -> None:
    """Exposing the port on the LAN needs its address listed; loopback stays reachable for health checks."""
    app = make_app("mr-review.lan, 192.168.1.10")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost") as client:
        lan = await client.get(_LIVEZ, headers={"host": "192.168.1.10:17240"})
        named = await client.get(_LIVEZ, headers={"host": "MR-Review.lan"})
        loopback = await client.get(_LIVEZ)
        foreign = await client.get(_LIVEZ, headers={"host": "192.168.1.11:17240"})

    assert (lan.status_code, named.status_code, loopback.status_code) == (200, 200, 200)
    assert foreign.status_code == 400


async def test__configured_allowlist__subdomain_wildcard__matches_subdomains_only(make_app: AppFactory) -> None:
    """``*.example.com`` covers its subdomains, not the bare domain."""
    app = make_app('["*.example.com"]')

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost") as client:
        sub = await client.get(_LIVEZ, headers={"host": "mr.example.com"})
        bare = await client.get(_LIVEZ, headers={"host": "example.com"})

    assert sub.status_code == 200
    assert bare.status_code == 400


async def test__allowlist_star__any_host__is_served(make_app: AppFactory) -> None:
    """``*`` is the explicit opt-out."""
    app = make_app("*")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost") as client:
        response = await client.get(_LIVEZ, headers={"host": "anything.example"})

    assert response.status_code == 200


@pytest.mark.parametrize("value", ["", " , ", "[]", "foo*.example.com", "*example.com"])
def test__allowed_hosts_setting__empty_or_malformed__is_rejected(value: str, monkeypatch: pytest.MonkeyPatch) -> None:
    """An empty list would refuse every request, and a misplaced wildcard would never match."""
    monkeypatch.setenv("MR_REVIEW__ALLOWED_HOSTS", value)

    with pytest.raises(ValidationError, match="allowed_hosts"):
        Settings()
