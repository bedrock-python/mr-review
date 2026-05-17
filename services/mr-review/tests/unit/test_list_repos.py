"""Unit tests for ListReposUseCase — including favourite-merge behaviour."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from mr_review.core.mrs.entities import Repo
from mr_review.use_cases.mrs.list_repos import ListReposUseCase

from tests.factories.entities import make_host

pytestmark = pytest.mark.unit


def _provider(*, listed: list[Repo], get_repo_returns: dict[str, Repo]) -> AsyncMock:
    provider = AsyncMock()
    provider.list_repos.return_value = listed
    provider.get_repo.side_effect = lambda repo_path: get_repo_returns[repo_path]
    return provider


async def test__list_repos__no_favourites__returns_listing_unchanged() -> None:
    # Arrange
    host = make_host(favourite_repos=[])
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host
    listed = [Repo(id="1", path="a/b", name="b", description=None)]
    provider = _provider(listed=listed, get_repo_returns={})
    factory = MagicMock(return_value=provider)
    use_case = ListReposUseCase(host_repo=host_repo, vcs_factory=factory)

    # Act
    result = await use_case.execute(host_id=host.id)

    # Assert
    assert result == listed
    provider.get_repo.assert_not_called()


async def test__list_repos__favourite_already_in_listing__no_extra_fetch() -> None:
    # Arrange
    host = make_host(favourite_repos=["a/b"])
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host
    listed = [Repo(id="1", path="a/b", name="b", description=None)]
    provider = _provider(listed=listed, get_repo_returns={})
    factory = MagicMock(return_value=provider)
    use_case = ListReposUseCase(host_repo=host_repo, vcs_factory=factory)

    # Act
    result = await use_case.execute(host_id=host.id)

    # Assert
    assert result == listed
    provider.get_repo.assert_not_called()


async def test__list_repos__favourite_not_member__prepended_to_result() -> None:
    """A pinned repo that is not a member should be fetched and prepended."""
    # Arrange
    host = make_host(favourite_repos=["torvalds/linux", "a/b"])
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host
    listed = [Repo(id="1", path="a/b", name="b", description=None)]
    extra = Repo(id="42", path="torvalds/linux", name="linux", description=None)
    provider = _provider(listed=listed, get_repo_returns={"torvalds/linux": extra})
    factory = MagicMock(return_value=provider)
    use_case = ListReposUseCase(host_repo=host_repo, vcs_factory=factory)

    # Act
    result = await use_case.execute(host_id=host.id)

    # Assert
    assert result == [extra, *listed]
    provider.get_repo.assert_awaited_once_with("torvalds/linux")


async def test__list_repos__favourite_fetch_fails__skips_extra_silently() -> None:
    # Arrange
    host = make_host(favourite_repos=["broken/repo"])
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host
    listed: list[Repo] = []
    provider = AsyncMock()
    provider.list_repos.return_value = listed
    provider.get_repo.side_effect = RuntimeError("404 not found")
    factory = MagicMock(return_value=provider)
    use_case = ListReposUseCase(host_repo=host_repo, vcs_factory=factory)

    # Act
    result = await use_case.execute(host_id=host.id)

    # Assert
    assert result == listed


async def test__list_repos__with_query__filters_extra_favourites() -> None:
    """When a search query is set, fetched favourites must also match the query."""
    # Arrange
    host = make_host(favourite_repos=["torvalds/linux", "vercel/next.js"])
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host
    listed: list[Repo] = []
    extras = {
        "torvalds/linux": Repo(id="1", path="torvalds/linux", name="linux", description=None),
        "vercel/next.js": Repo(id="2", path="vercel/next.js", name="next.js", description=None),
    }
    provider = _provider(listed=listed, get_repo_returns=extras)
    factory = MagicMock(return_value=provider)
    use_case = ListReposUseCase(host_repo=host_repo, vcs_factory=factory)

    # Act
    result = await use_case.execute(host_id=host.id, query="linux")

    # Assert
    assert [r.path for r in result] == ["torvalds/linux"]


async def test__list_repos__host_not_found__raises() -> None:
    # Arrange
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = None
    factory = MagicMock()
    use_case = ListReposUseCase(host_repo=host_repo, vcs_factory=factory)

    # Act / Assert
    with pytest.raises(ValueError, match="not found"):
        await use_case.execute(host_id=make_host().id)
    factory.assert_not_called()
