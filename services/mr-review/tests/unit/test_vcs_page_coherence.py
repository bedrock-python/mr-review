"""Cached listing pages stay coherent with their page 1 (activity-sorted listings move items between pages)."""

from __future__ import annotations

import pytest
from mr_review.core.mrs.entities import Repo
from mr_review.core.pagination import Page
from mr_review.infra.vcs.cache import PAGE_COHERENCE_SECONDS, CachedVCSProvider

pytestmark = pytest.mark.unit


class _Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


class _ActivitySortedHost:
    """Repositories most recently pushed to first, like every host's listing."""

    def __init__(self) -> None:
        self.order = [f"g/r{i:03d}" for i in range(120)]
        self.calls: list[int] = []

    def push(self, path: str) -> None:
        self.order.remove(path)
        self.order.insert(0, path)

    async def list_repos(self, query: str | None = None, page: int = 1, per_page: int = 50) -> Page[Repo]:
        self.calls.append(page)
        chunk = self.order[(page - 1) * per_page : page * per_page]
        return Page(
            items=[Repo(id=p, path=p, name=p) for p in chunk],
            page=page,
            per_page=per_page,
            has_more=page * per_page < len(self.order),
        )


def _setup() -> tuple[_ActivitySortedHost, CachedVCSProvider, _Clock]:
    host = _ActivitySortedHost()
    clock = _Clock()
    return host, CachedVCSProvider(host, clock=clock), clock  # type: ignore[arg-type]


def _paths(*pages: Page[Repo]) -> set[str]:
    return {repo.path for page in pages for repo in page.items}


async def test__later_page_fetched_long_after_page_one__next_load_starts_from_a_fresh_page_one() -> None:
    """The reviewer's case: a push moves g/r070 from page 2 to page 1 between the two fetches."""
    host, cached, clock = _setup()
    await cached.list_repos(page=1)
    host.push("g/r070")
    clock.now += 60  # the user scrolls a minute later
    await cached.list_repos(page=2)

    # Reloading the list must not serve the stale page 1 for the rest of its 15-minute TTL.
    reload = [await cached.list_repos(page=p) for p in (1, 2, 3)]

    assert "g/r070" in _paths(reload[0])
    assert _paths(*reload) == set(host.order)


async def test__push_between_page_fetches__overlap_retires_the_stale_page_one() -> None:
    """Same push, but page 2 follows page 1 at once: page 1's last repo reappearing on page 2 gives it away."""
    host, cached, _ = _setup()
    await cached.list_repos(page=1)
    host.push("g/r070")
    page_two = await cached.list_repos(page=2)

    assert "g/r049" in _paths(page_two)  # pushed down from page 1
    reload = [await cached.list_repos(page=p) for p in (1, 2, 3)]
    assert "g/r070" in _paths(reload[0])
    assert _paths(*reload) == set(host.order)


async def test__new_page_one__makes_cached_later_pages_unreachable() -> None:
    host, cached, clock = _setup()
    await cached.list_repos(page=1)
    await cached.list_repos(page=2)
    host.calls.clear()

    clock.now += 901  # page 1 expired (repos TTL is 15 minutes); page 2 was cached a moment later
    host.push("g/r070")
    reload = [await cached.list_repos(page=p) for p in (1, 2)]

    assert host.calls == [1, 2]
    assert _paths(*reload) == set(host.order[:100])


async def test__pages_loaded_together__are_served_from_the_cache() -> None:
    host, cached, clock = _setup()
    await cached.list_repos(page=1)
    clock.now += PAGE_COHERENCE_SECONDS / 2
    await cached.list_repos(page=2)
    host.calls.clear()

    clock.now += 120
    await cached.list_repos(page=1)
    await cached.list_repos(page=2)

    assert host.calls == []


async def test__later_page_without_a_cached_page_one__is_not_cached() -> None:
    host, cached, _ = _setup()

    await cached.list_repos(page=2)
    await cached.list_repos(page=2)

    assert host.calls == [2, 2]
