from __future__ import annotations

from uuid import uuid4

import pytest
from mr_review.infra.repositories.host import FileHostRepository

pytestmark = pytest.mark.integration

_TOKEN = "test-token"  # noqa: S105


async def test__host_repo_create__valid_params__persists_and_returns_entity(
    host_repo: FileHostRepository,
) -> None:
    """repo.create stores a new host and the returned entity has the expected field values."""
    # Arrange / Act
    host = await host_repo.create(
        name="GitLab Instance",
        type_="gitlab",
        base_url="https://gitlab.example.com",
        token=_TOKEN,  # noqa: S106
    )

    # Assert
    assert host.name == "GitLab Instance"
    assert host.type == "gitlab"
    assert host.base_url == "https://gitlab.example.com"
    assert host.token == _TOKEN


async def test__host_repo_get_by_id__host_exists__returns_matching_entity(
    host_repo: FileHostRepository,
) -> None:
    """repo.get_by_id returns the exact entity that was previously created."""
    # Arrange
    created = await host_repo.create(
        name="My Host",
        type_="github",
        base_url="https://api.github.com",
        token=_TOKEN,  # noqa: S106
    )

    # Act
    fetched = await host_repo.get_by_id(created.id)

    # Assert
    assert fetched is not None
    assert fetched.id == created.id
    assert fetched.name == created.name


async def test__host_repo_get_by_id__host_not_found__returns_none(
    host_repo: FileHostRepository,
) -> None:
    """repo.get_by_id returns None for an ID that was never persisted."""
    # Arrange / Act
    result = await host_repo.get_by_id(uuid4())

    # Assert
    assert result is None


async def test__host_repo_list_all__multiple_hosts_created__returns_all(
    host_repo: FileHostRepository,
) -> None:
    """repo.list_all returns every host that has been created."""
    # Arrange
    await host_repo.create(name="Alpha", type_="gitlab", base_url="https://a.com", token=_TOKEN)  # noqa: S106
    await host_repo.create(name="Beta", type_="github", base_url="https://b.com", token=_TOKEN)  # noqa: S106

    # Act
    hosts = await host_repo.list_all()

    # Assert
    names = {h.name for h in hosts}
    assert "Alpha" in names
    assert "Beta" in names


async def test__host_repo_delete__host_exists__removes_it_and_returns_true(
    host_repo: FileHostRepository,
) -> None:
    """repo.delete returns True and the host is no longer retrievable afterwards."""
    # Arrange
    host = await host_repo.create(name="ToDelete", type_="gitlab", base_url="https://x.com", token=_TOKEN)  # noqa: S106

    # Act
    deleted = await host_repo.delete(host.id)

    # Assert
    assert deleted is True
    assert await host_repo.get_by_id(host.id) is None


async def test__host_repo_delete__host_not_found__returns_false(
    host_repo: FileHostRepository,
) -> None:
    """repo.delete returns False when given an ID that does not exist."""
    # Arrange / Act
    result = await host_repo.delete(uuid4())

    # Assert
    assert result is False
