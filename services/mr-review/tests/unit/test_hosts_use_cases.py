from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from mr_review.use_cases.hosts.create_host import CreateHostUseCase
from mr_review.use_cases.hosts.delete_host import DeleteHostUseCase
from mr_review.use_cases.hosts.invalidate_host_cache import InvalidateHostCacheUseCase
from mr_review.use_cases.hosts.list_hosts import ListHostsUseCase
from mr_review.use_cases.hosts.update_host import UpdateHostUseCase

from tests.factories.entities import make_host

pytestmark = pytest.mark.unit

_TOKEN = "secret-token"  # noqa: S105


async def test__create_host__valid_params__delegates_to_repo_and_returns_entity() -> None:
    """CreateHostUseCase.execute passes all args to repo.create and returns its result."""
    # Arrange
    repo = AsyncMock()
    expected = make_host(name="my-host")
    repo.create.return_value = expected
    use_case = CreateHostUseCase(repo)

    # Act
    result = await use_case.execute(
        name="my-host",
        type_="gitlab",
        base_url="https://gitlab.com",
        token=_TOKEN,  # noqa: S106
    )

    # Assert
    repo.create.assert_awaited_once_with(
        name="my-host",
        type_="gitlab",
        base_url="https://gitlab.com",
        token=_TOKEN,  # noqa: S106
        color=None,
        timeout=30,
    )
    assert result == expected


async def test__list_hosts__repo_has_items__returns_all_hosts() -> None:
    """ListHostsUseCase.execute returns every host returned by the repository."""
    # Arrange
    repo = AsyncMock()
    hosts = [make_host(name=f"host-{i}") for i in range(3)]
    repo.list_all.return_value = hosts
    use_case = ListHostsUseCase(repo)

    # Act
    result = await use_case.execute()

    # Assert
    assert result == hosts
    repo.list_all.assert_awaited_once()


async def test__delete_host__host_exists__returns_true() -> None:
    """DeleteHostUseCase.execute returns True when the repo successfully deletes the host."""
    # Arrange
    repo = AsyncMock()
    repo.delete.return_value = True
    host_id = uuid4()
    use_case = DeleteHostUseCase(repo, MagicMock())

    # Act
    result = await use_case.execute(host_id)

    # Assert
    assert result is True
    repo.delete.assert_awaited_once_with(host_id)


async def test__delete_host__host_not_found__returns_false() -> None:
    """DeleteHostUseCase.execute returns False when the repo reports the host is missing."""
    # Arrange
    repo = AsyncMock()
    repo.delete.return_value = False
    use_case = DeleteHostUseCase(repo, MagicMock())

    # Act
    result = await use_case.execute(uuid4())

    # Assert
    assert result is False


async def test__delete_host__deleted__drops_the_host_cache() -> None:
    repo = AsyncMock()
    repo.delete.return_value = True
    cache = MagicMock()
    host_id = uuid4()

    await DeleteHostUseCase(repo, cache).execute(host_id)

    cache.invalidate.assert_called_once_with(host_id)


async def test__delete_host__missing__leaves_the_cache_alone() -> None:
    repo = AsyncMock()
    repo.delete.return_value = False
    cache = MagicMock()

    await DeleteHostUseCase(repo, cache).execute(uuid4())

    cache.invalidate.assert_not_called()


async def test__update_host__updated__drops_the_host_cache() -> None:
    host = make_host()
    repo = AsyncMock()
    repo.update.return_value = host
    cache = MagicMock()

    result = await UpdateHostUseCase(repo, cache).execute(host.id, base_url="https://new.example.com")

    assert result == host
    cache.invalidate.assert_called_once_with(host.id)


async def test__update_host__missing__leaves_the_cache_alone() -> None:
    repo = AsyncMock()
    repo.update.return_value = None
    cache = MagicMock()

    assert await UpdateHostUseCase(repo, cache).execute(uuid4(), name="x") is None
    cache.invalidate.assert_not_called()


@pytest.mark.parametrize("repo_path", [None, "group/proj"])
async def test__invalidate_host_cache__known_host__invalidates(repo_path: str | None) -> None:
    host = make_host()
    repo = AsyncMock()
    repo.get_by_id.return_value = host
    cache = MagicMock()

    await InvalidateHostCacheUseCase(repo, cache).execute(host.id, repo_path=repo_path)

    cache.invalidate.assert_called_once_with(host.id, repo_path)


async def test__invalidate_host_cache__unknown_host__raises_without_touching_the_cache() -> None:
    repo = AsyncMock()
    repo.get_by_id.return_value = None
    cache = MagicMock()

    with pytest.raises(ValueError, match="not found"):
        await InvalidateHostCacheUseCase(repo, cache).execute(uuid4())
    cache.invalidate.assert_not_called()
