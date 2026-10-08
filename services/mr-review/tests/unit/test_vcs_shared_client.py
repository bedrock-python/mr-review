"""Regression: requests for one host must never end up on another request's (closed) HTTP client.

The old design built an httpx client per request and swapped it into the process-wide cached
provider, so request A could run on request B's client after B had finished and closed it
("Cannot send a request, as the client has been closed"). Now one app-scoped client serves every
request and the per-host provider is built once.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import httpx
import pytest
from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.vcs.cache import VCSCache
from mr_review.use_cases.mrs.list_mrs import ListMRsUseCase

from tests.factories.vcs_container import make_container
from tests.factories.vcs_http import json_response

pytestmark = pytest.mark.unit


class _SlowGitLab:
    """Answers every merge-request listing after a short delay, counting requests."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        await asyncio.sleep(0.01)
        return json_response([], headers={"X-Next-Page": ""})


async def test__provider_from_finished_request__keeps_working_for_a_running_one(tmp_path: Path) -> None:
    gitlab = _SlowGitLab()
    container = make_container(tmp_path, httpx.MockTransport(gitlab))
    host = await (await container.get(FileHostRepository)).create(
        name="GL", type_="gitlab", base_url="https://gitlab.example.com", token="secret"
    )

    async with container() as request_a:
        provider_a = (await request_a.get(VCSCache)).get(host)
        async with container() as request_b:
            provider_b = (await request_b.get(VCSCache)).get(host)
            await provider_b.list_mrs("group/proj", page=1)
        # Request B is over. Request A carries on with the provider it already holds.
        page = await provider_a.list_mrs("group/proj", page=2)

    assert provider_a is provider_b
    assert page.page == 2
    client = await container.get(httpx.AsyncClient)
    assert not client.is_closed

    await container.close()
    assert client.is_closed


async def test__concurrent_requests_on_one_host__all_succeed_on_the_shared_client(tmp_path: Path) -> None:
    gitlab = _SlowGitLab()
    container = make_container(tmp_path, httpx.MockTransport(gitlab))
    host = await (await container.get(FileHostRepository)).create(
        name="GL", type_="gitlab", base_url="https://gitlab.example.com", token="secret"
    )

    async def one_request(page: int) -> int:
        async with container() as request:
            use_case = await request.get(ListMRsUseCase)
            result = await use_case.execute(host_id=host.id, repo_path="group/proj", page=page)
            return result.page

    pages = await asyncio.gather(*[one_request(page) for page in range(1, 21)])

    assert pages == list(range(1, 21))
    assert len(gitlab.requests) == 20
    await container.close()


async def test__concurrent_identical_requests__share_one_upstream_call(tmp_path: Path) -> None:
    gitlab = _SlowGitLab()
    container = make_container(tmp_path, httpx.MockTransport(gitlab))
    host = await (await container.get(FileHostRepository)).create(
        name="GL", type_="gitlab", base_url="https://gitlab.example.com", token="secret"
    )

    async def one_request() -> None:
        async with container() as request:
            await (await request.get(ListMRsUseCase)).execute(host_id=host.id, repo_path="group/proj")

    await asyncio.gather(*[one_request() for _ in range(10)])

    assert len(gitlab.requests) == 1
    await container.close()


async def test__token_change__rebuilds_the_provider_with_the_new_token(tmp_path: Path) -> None:
    gitlab = _SlowGitLab()
    container = make_container(tmp_path, httpx.MockTransport(gitlab))
    host_repo = await container.get(FileHostRepository)
    host = await host_repo.create(name="GL", type_="gitlab", base_url="https://gitlab.example.com", token="old")

    async with container() as request:
        await (await request.get(ListMRsUseCase)).execute(host_id=host.id, repo_path="group/proj")
    await host_repo.update(host.id, token="new")
    async with container() as request:
        await (await request.get(ListMRsUseCase)).execute(host_id=host.id, repo_path="group/proj")

    assert [r.headers["PRIVATE-TOKEN"] for r in gitlab.requests] == ["old", "new"]
    await container.close()
