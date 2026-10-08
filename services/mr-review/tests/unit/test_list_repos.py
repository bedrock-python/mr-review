"""Unit tests for ListReposUseCase — pagination and favourite-merge behaviour."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest
from mr_review.core.mrs.entities import Repo
from mr_review.core.pagination import Page
from mr_review.use_cases.mrs.list_repos import ListReposUseCase

from tests.factories.entities import make_host

pytestmark = pytest.mark.unit


def _repo(path: str) -> Repo:
    return Repo(id=path, path=path, name=path.rsplit("/", 1)[-1], description=None)


def _page(items: list[Repo], *, page: int = 1, per_page: int = 50, has_more: bool = False) -> Page[Repo]:
    return Page(items=items, page=page, per_page=per_page, has_more=has_more)


def _use_case(favourites: list[str], provider: AsyncMock) -> tuple[ListReposUseCase, UUID]:
    host = make_host(favourite_repos=favourites)
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = host
    return ListReposUseCase(host_repo=host_repo, vcs_factory=MagicMock(return_value=provider)), host.id


async def test__list_repos__no_favourites__returns_listing_page_unchanged() -> None:
    # Arrange
    provider = AsyncMock()
    provider.list_repos.return_value = _page([_repo("a/b")], page=2, per_page=10, has_more=True)
    use_case, host_id = _use_case([], provider)

    # Act
    result = await use_case.execute(host_id=host_id, page=2, per_page=10)

    # Assert
    assert result == _page([_repo("a/b")], page=2, per_page=10, has_more=True)
    provider.list_repos.assert_awaited_once_with(query=None, page=2, per_page=10)
    provider.get_repo.assert_not_called()


async def test__list_repos__favourite_already_on_page_one__no_extra_fetch() -> None:
    provider = AsyncMock()
    provider.list_repos.return_value = _page([_repo("a/b")])
    use_case, host_id = _use_case(["a/b"], provider)

    result = await use_case.execute(host_id=host_id)

    assert [r.path for r in result.items] == ["a/b"]
    provider.get_repo.assert_not_called()


async def test__list_repos__favourite_not_listed__prepended_on_page_one() -> None:
    extra = _repo("torvalds/linux")
    provider = AsyncMock()
    provider.list_repos.return_value = _page([_repo("a/b")], has_more=True)
    provider.get_repo.side_effect = lambda repo_path: {"torvalds/linux": extra}[repo_path]
    use_case, host_id = _use_case(["torvalds/linux", "a/b"], provider)

    result = await use_case.execute(host_id=host_id)

    assert [r.path for r in result.items] == ["torvalds/linux", "a/b"]
    assert result.has_more is True
    provider.get_repo.assert_awaited_once_with("torvalds/linux")


async def test__list_repos__later_page__never_fetches_favourites_and_drops_them_from_listing() -> None:
    """A favourite listed on page 3 was already prepended to page 1, so page 3 must not repeat it."""
    provider = AsyncMock()
    provider.list_repos.return_value = _page([_repo("x/y"), _repo("torvalds/linux")], page=3, has_more=False)
    use_case, host_id = _use_case(["torvalds/linux"], provider)

    result = await use_case.execute(host_id=host_id, page=3)

    assert [r.path for r in result.items] == ["x/y"]
    assert result.page == 3
    provider.get_repo.assert_not_called()


async def test__list_repos__later_page_with_query__keeps_favourites_that_page_one_filtered_out() -> None:
    """With a query, page 1 only prepends favourites matching it; others must survive on later pages."""
    provider = AsyncMock()
    provider.list_repos.return_value = _page([_repo("org/backend-api"), _repo("org/linux-tools")], page=2)
    use_case, host_id = _use_case(["org/backend-api", "org/linux-tools"], provider)

    result = await use_case.execute(host_id=host_id, query="linux", page=2)

    assert [r.path for r in result.items] == ["org/backend-api"]


async def test__list_repos__favourite_fetch_fails__skips_extra_silently() -> None:
    provider = AsyncMock()
    provider.list_repos.return_value = _page([])
    provider.get_repo.side_effect = RuntimeError("404 not found")
    use_case, host_id = _use_case(["broken/repo"], provider)

    result = await use_case.execute(host_id=host_id)

    assert result.items == []


async def test__list_repos__with_query__filters_extra_favourites() -> None:
    extras = {"torvalds/linux": _repo("torvalds/linux"), "vercel/next.js": _repo("vercel/next.js")}
    provider = AsyncMock()
    provider.list_repos.return_value = _page([])
    provider.get_repo.side_effect = lambda repo_path: extras[repo_path]
    use_case, host_id = _use_case(["torvalds/linux", "vercel/next.js"], provider)

    result = await use_case.execute(host_id=host_id, query="linux")

    assert [r.path for r in result.items] == ["torvalds/linux"]
    provider.list_repos.assert_awaited_once_with(query="linux", page=1, per_page=50)


async def test__list_repos__host_not_found__raises() -> None:
    host_repo = AsyncMock()
    host_repo.get_by_id.return_value = None
    factory = MagicMock()
    use_case = ListReposUseCase(host_repo=host_repo, vcs_factory=factory)

    with pytest.raises(ValueError, match="not found"):
        await use_case.execute(host_id=make_host().id)
    factory.assert_not_called()
