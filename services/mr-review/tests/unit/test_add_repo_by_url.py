"""Unit tests for AddRepoByUrlUseCase."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from mr_review.core.mrs.entities import Repo
from mr_review.core.vcs.url_parser import InvalidRepoUrlError
from mr_review.use_cases.hosts.add_repo_by_url import AddRepoByUrlUseCase

from tests.factories.entities import make_host

pytestmark = pytest.mark.unit


def _make_provider(repo: Repo) -> AsyncMock:
    provider = AsyncMock()
    provider.get_repo.return_value = repo
    return provider


async def test__add_repo_by_url__valid_url__pins_and_returns_repo() -> None:
    """A new path is appended to favourite_repos and the host is persisted."""
    # Arrange
    host = make_host(type="github")
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host
    updated_host = host.model_copy(update={"favourite_repos": ["torvalds/linux"]})
    host_repo.set_favourite_repos.return_value = updated_host

    repo = Repo(id="42", path="torvalds/linux", name="linux", description=None)
    provider = _make_provider(repo)
    factory = MagicMock(return_value=provider)
    use_case = AddRepoByUrlUseCase(host_repo=host_repo, vcs_factory=factory)

    # Act
    result_host, result_repo = await use_case.execute(
        host_id=host.id, url_or_path="https://github.com/torvalds/linux"
    )

    # Assert
    provider.get_repo.assert_awaited_once_with("torvalds/linux")
    host_repo.set_favourite_repos.assert_awaited_once_with(host.id, ["torvalds/linux"])
    assert result_repo == repo
    assert result_host == updated_host


async def test__add_repo_by_url__already_pinned__skips_write() -> None:
    """When the resolved path is already a favourite, no repository write happens."""
    # Arrange
    host = make_host(type="github", favourite_repos=["torvalds/linux"])
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host

    repo = Repo(id="42", path="torvalds/linux", name="linux", description=None)
    provider = _make_provider(repo)
    factory = MagicMock(return_value=provider)
    use_case = AddRepoByUrlUseCase(host_repo=host_repo, vcs_factory=factory)

    # Act
    result_host, result_repo = await use_case.execute(
        host_id=host.id, url_or_path="torvalds/linux"
    )

    # Assert
    host_repo.set_favourite_repos.assert_not_called()
    assert result_repo == repo
    assert result_host == host


async def test__add_repo_by_url__host_not_found__raises_value_error() -> None:
    # Arrange
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = None
    factory = MagicMock()
    use_case = AddRepoByUrlUseCase(host_repo=host_repo, vcs_factory=factory)

    # Act / Assert
    with pytest.raises(ValueError, match="not found"):
        await use_case.execute(host_id=uuid4(), url_or_path="torvalds/linux")
    factory.assert_not_called()


async def test__add_repo_by_url__invalid_path__raises_before_vcs_call() -> None:
    # Arrange
    host = make_host(type="github")
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host
    provider = AsyncMock()
    factory = MagicMock(return_value=provider)
    use_case = AddRepoByUrlUseCase(host_repo=host_repo, vcs_factory=factory)

    # Act / Assert
    with pytest.raises(InvalidRepoUrlError):
        await use_case.execute(host_id=host.id, url_or_path="just-one")
    provider.get_repo.assert_not_called()
    host_repo.set_favourite_repos.assert_not_called()
