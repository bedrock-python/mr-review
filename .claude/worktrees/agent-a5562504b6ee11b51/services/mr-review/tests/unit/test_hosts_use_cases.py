from __future__ import annotations

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from mr_review.core.hosts.entities import Host
from mr_review.use_cases.hosts.create_host import CreateHostUseCase
from mr_review.use_cases.hosts.delete_host import DeleteHostUseCase
from mr_review.use_cases.hosts.list_hosts import ListHostsUseCase


def _make_host(**kwargs: object) -> Host:
    from datetime import datetime, timezone

    return Host(
        id=kwargs.get("id", uuid4()),
        name=kwargs.get("name", "test"),
        type=kwargs.get("type", "gitlab"),
        base_url=kwargs.get("base_url", "https://gitlab.com"),
        token=kwargs.get("token", "secret"),
        created_at=kwargs.get("created_at", datetime.now(timezone.utc)),
    )


@pytest.mark.unit
async def test_create_host_delegates_to_repo() -> None:
    repo = AsyncMock()
    expected = _make_host(name="my-host")
    repo.create.return_value = expected

    use_case = CreateHostUseCase(repo)
    _tok = "tok"  # noqa: S105
    result = await use_case.execute(name="my-host", type_="gitlab", base_url="https://gitlab.com", token=_tok)  # noqa: S106

    repo.create.assert_awaited_once_with(name="my-host", type_="gitlab", base_url="https://gitlab.com", token=_tok)  # noqa: S106
    assert result == expected


@pytest.mark.unit
async def test_list_hosts_returns_all() -> None:
    repo = AsyncMock()
    hosts = [_make_host(name=f"host-{i}") for i in range(3)]
    repo.list_all.return_value = hosts

    use_case = ListHostsUseCase(repo)
    result = await use_case.execute()

    assert result == hosts
    repo.list_all.assert_awaited_once()


@pytest.mark.unit
async def test_delete_host_returns_true_on_success() -> None:
    repo = AsyncMock()
    repo.delete.return_value = True
    host_id = uuid4()

    use_case = DeleteHostUseCase(repo)
    result = await use_case.execute(host_id)

    assert result is True
    repo.delete.assert_awaited_once_with(host_id)


@pytest.mark.unit
async def test_delete_host_returns_false_when_not_found() -> None:
    repo = AsyncMock()
    repo.delete.return_value = False

    use_case = DeleteHostUseCase(repo)
    result = await use_case.execute(uuid4())

    assert result is False
