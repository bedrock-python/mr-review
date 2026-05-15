from __future__ import annotations

from uuid import uuid4

import pytest
from mr_review.infra.repositories.host import SQLiteHostRepository

_TOKEN = "test-token"  # noqa: S105


@pytest.mark.integration
async def test_create_and_get_host(host_repo: SQLiteHostRepository) -> None:
    host = await host_repo.create(
        name="GitLab Instance",
        type_="gitlab",
        base_url="https://gitlab.example.com",
        token=_TOKEN,  # noqa: S106
    )

    assert host.name == "GitLab Instance"
    assert host.type == "gitlab"
    assert host.base_url == "https://gitlab.example.com"
    assert host.token == _TOKEN

    fetched = await host_repo.get_by_id(host.id)
    assert fetched is not None
    assert fetched.id == host.id
    assert fetched.name == host.name


@pytest.mark.integration
async def test_list_hosts(host_repo: SQLiteHostRepository) -> None:
    await host_repo.create(name="A", type_="gitlab", base_url="https://a.com", token=_TOKEN)  # noqa: S106
    await host_repo.create(name="B", type_="github", base_url="https://b.com", token=_TOKEN)  # noqa: S106

    hosts = await host_repo.list_all()
    names = {h.name for h in hosts}
    assert "A" in names
    assert "B" in names


@pytest.mark.integration
async def test_delete_host(host_repo: SQLiteHostRepository) -> None:
    host = await host_repo.create(name="ToDelete", type_="gitlab", base_url="https://x.com", token=_TOKEN)  # noqa: S106

    deleted = await host_repo.delete(host.id)
    assert deleted is True

    fetched = await host_repo.get_by_id(host.id)
    assert fetched is None


@pytest.mark.integration
async def test_delete_nonexistent_host(host_repo: SQLiteHostRepository) -> None:
    result = await host_repo.delete(uuid4())
    assert result is False


@pytest.mark.integration
async def test_get_nonexistent_host(host_repo: SQLiteHostRepository) -> None:
    result = await host_repo.get_by_id(uuid4())
    assert result is None
