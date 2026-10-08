"""TTLCache (LRU cap, expiry, single-flight, no error caching), CachedVCSProvider keys, VCSCache registry."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import httpx
import pytest
from mr_review.core.mrs.entities import Repo
from mr_review.core.pagination import Page
from mr_review.infra.vcs.cache import CachedVCSProvider, TTLCache, VCSCache

from tests.factories.entities import make_host

pytestmark = pytest.mark.unit


class _Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


class _Loader:
    """Counts calls; optionally blocks until released so concurrent callers overlap."""

    def __init__(self, value: object = "value", error: Exception | None = None) -> None:
        self.calls = 0
        self.value = value
        self.error = error
        self.release = asyncio.Event()
        self.release.set()

    async def __call__(self) -> object:
        self.calls += 1
        await self.release.wait()
        if self.error is not None:
            raise self.error
        return self.value


async def test__ttl_cache__hit__does_not_reload() -> None:
    cache = TTLCache(ttl=60, max_entries=10)
    loader = _Loader()

    assert await cache.get_or_load("k", loader) == "value"
    assert await cache.get_or_load("k", loader) == "value"

    assert loader.calls == 1


async def test__ttl_cache__entry_expires_after_ttl() -> None:
    clock = _Clock()
    cache = TTLCache(ttl=60, max_entries=10, clock=clock)
    loader = _Loader()
    await cache.get_or_load("k", loader)

    clock.now += 59
    await cache.get_or_load("k", loader)
    assert loader.calls == 1

    clock.now += 1
    await cache.get_or_load("k", loader)
    assert loader.calls == 2


async def test__ttl_cache__over_capacity__evicts_least_recently_used() -> None:
    cache = TTLCache(ttl=60, max_entries=2)
    loaders = {key: _Loader(value=key) for key in ("a", "b", "c")}
    await cache.get_or_load("a", loaders["a"])
    await cache.get_or_load("b", loaders["b"])
    await cache.get_or_load("a", loaders["a"])  # "a" is now the most recently used

    await cache.get_or_load("c", loaders["c"])

    assert len(cache) == 2
    await cache.get_or_load("a", loaders["a"])
    assert loaders["a"].calls == 1
    await cache.get_or_load("b", loaders["b"])
    assert loaders["b"].calls == 2


async def test__ttl_cache__expired_entries__are_swept_on_a_later_write() -> None:
    clock = _Clock()
    cache = TTLCache(ttl=60, max_entries=100, clock=clock)
    for key in ("a", "b", "c"):
        await cache.get_or_load(key, _Loader())
    assert len(cache) == 3

    clock.now += 61
    await cache.get_or_load("d", _Loader())

    assert len(cache) == 1


async def test__ttl_cache__concurrent_misses__share_one_load() -> None:
    cache = TTLCache(ttl=60, max_entries=10)
    loader = _Loader()
    loader.release.clear()

    waiters = [asyncio.create_task(cache.get_or_load("k", loader)) for _ in range(5)]
    await asyncio.sleep(0)
    loader.release.set()
    results = await asyncio.gather(*waiters)

    assert results == ["value"] * 5
    assert loader.calls == 1


async def test__ttl_cache__failed_load__is_shared_by_waiters_and_not_cached() -> None:
    cache = TTLCache(ttl=60, max_entries=10)
    loader = _Loader(error=RuntimeError("upstream 502"))
    loader.release.clear()

    waiters = [asyncio.create_task(cache.get_or_load("k", loader)) for _ in range(3)]
    await asyncio.sleep(0)
    loader.release.set()
    results = await asyncio.gather(*waiters, return_exceptions=True)

    assert all(isinstance(r, RuntimeError) for r in results)
    assert loader.calls == 1
    assert len(cache) == 0

    loader.error = None
    assert await cache.get_or_load("k", loader) == "value"
    assert loader.calls == 2


async def test__ttl_cache__cancelled_waiter__does_not_cancel_the_shared_load() -> None:
    cache = TTLCache(ttl=60, max_entries=10)
    loader = _Loader()
    loader.release.clear()

    first = asyncio.create_task(cache.get_or_load("k", loader))
    second = asyncio.create_task(cache.get_or_load("k", loader))
    await asyncio.sleep(0)
    first.cancel()
    await asyncio.sleep(0)
    loader.release.set()

    assert await second == "value"
    with pytest.raises(asyncio.CancelledError):
        await first
    assert loader.calls == 1
    assert len(cache) == 1


async def test__ttl_cache__invalidate_with_predicate__drops_only_matching_keys() -> None:
    cache = TTLCache(ttl=60, max_entries=10)
    loaders = {key: _Loader(value=key) for key in (("a", 1), ("a", 2), ("b", 1))}
    for key, loader in loaders.items():
        await cache.get_or_load(key, loader)

    cache.invalidate(lambda key: key[0] == "a")  # type: ignore[index]

    assert len(cache) == 1
    for key, loader in loaders.items():
        await cache.get_or_load(key, loader)
    assert [loader.calls for loader in loaders.values()] == [2, 2, 1]


async def test__ttl_cache__invalidate_all__drops_everything() -> None:
    cache = TTLCache(ttl=60, max_entries=10)
    for key in ("a", "b"):
        await cache.get_or_load(key, _Loader())

    cache.invalidate()

    assert len(cache) == 0


async def test__ttl_cache__load_running_during_invalidate__answers_but_is_not_stored() -> None:
    cache = TTLCache(ttl=60, max_entries=10)
    stale = _Loader(value="before push")
    stale.release.clear()
    waiter = asyncio.create_task(cache.get_or_load("k", stale))
    await asyncio.sleep(0)

    cache.invalidate()
    fresh = _Loader(value="after push")
    fresh_value = await cache.get_or_load("k", fresh)
    stale.release.set()

    assert await waiter == "before push"
    assert fresh_value == "after push"
    assert await cache.get_or_load("k", _Loader(value="unused")) == "after push"


def _repo_page(page: int) -> Page[Repo]:
    return Page(items=[Repo(id=str(page), path=f"g/r{page}", name="r")], page=page, per_page=1, has_more=True)


async def test__cached_provider__list_keys_include_every_paging_argument() -> None:
    inner = AsyncMock()
    inner.list_repos.side_effect = lambda query, page, per_page: _repo_page(page)
    inner.list_mrs.return_value = Page(items=[], page=1, per_page=30, has_more=False)
    inner.list_my_mrs.return_value = Page(items=[], page=1, per_page=30, has_more=False)
    provider = CachedVCSProvider(inner)

    assert (await provider.list_repos(page=1, per_page=1)).page == 1
    assert (await provider.list_repos(page=2, per_page=1)).page == 2
    await provider.list_repos(page=2, per_page=1)
    await provider.list_repos(query="x", page=2, per_page=1)
    assert inner.list_repos.await_count == 3

    for kwargs in (
        {"state": "opened"},
        {"state": "merged"},
        {"state": "merged", "page": 2},
        {"state": "merged", "per_page": 10},
        {"state": "merged", "per_page": 10, "page": 2},
        {"state": "merged", "per_page": 10, "query": "fix"},
        {"state": "merged", "per_page": 10, "query": "fix"},
    ):
        await provider.list_mrs("g/r", **kwargs)
    assert inner.list_mrs.await_count == 6

    await provider.list_my_mrs("authored")
    await provider.list_my_mrs("assigned")
    await provider.list_my_mrs("assigned", page=2)
    await provider.list_my_mrs("assigned", page=2)
    assert inner.list_my_mrs.await_count == 3


async def test__cached_provider__writes_bypass_the_cache() -> None:
    inner = AsyncMock()
    provider = CachedVCSProvider(inner)

    await provider.post_general_note("g/r", 1, "a")
    await provider.post_general_note("g/r", 1, "a")

    assert inner.post_general_note.await_count == 2


async def test__vcs_cache__same_host__one_provider_until_its_credentials_change() -> None:
    async with httpx.AsyncClient() as client:
        registry = VCSCache(client=client)
        host = make_host(type="github", token="one")

        first = registry.get(host)
        assert registry.get(host) is first
        assert registry.get(host.model_copy(update={"name": "renamed"})) is first

        rotated = registry.get(make_host(id=host.id, type="github", token="two"))
        assert rotated is not first
        moved = registry.get(make_host(id=host.id, type="github", token="two", base_url="https://ghe.example.com"))
        assert moved is not rotated

        registry.invalidate(host.id)
        assert registry.get(host) is not first


async def test__cached_provider__invalidate_repo__drops_only_that_repos_entries() -> None:
    inner = AsyncMock()
    inner.list_repos.return_value = Page(items=[], page=1, per_page=50, has_more=False)
    inner.list_mrs.return_value = Page(items=[], page=1, per_page=30, has_more=False)
    inner.get_diff.return_value = []
    inner.get_diff_refs.return_value = {}
    inner.get_file.return_value = "content"
    inner.list_directory.return_value = ["src/a.py"]
    inner.get_commits.return_value = []
    provider = CachedVCSProvider(inner)

    async def touch(repo: str) -> None:
        await provider.list_mrs(repo)
        await provider.get_diff(repo, 1)
        await provider.get_diff_refs(repo, 1)
        await provider.get_file(repo, "src/a.py", "sha")
        await provider.list_directory(repo, "src", "sha")
        await provider.get_commits(repo, "src/a.py", "sha")

    await provider.list_repos()
    await touch("g/a")
    await touch("g/b")

    provider.invalidate("g/a")
    await provider.list_repos()
    await touch("g/a")
    await touch("g/b")

    for method in (inner.list_mrs, inner.get_diff, inner.get_diff_refs, inner.get_file, inner.list_directory):
        assert method.await_count == 3, method
    assert inner.get_commits.await_count == 3
    assert inner.list_repos.await_count == 1

    provider.invalidate()
    await provider.list_repos()
    assert inner.list_repos.await_count == 2


async def test__vcs_cache__invalidate__repo_keeps_the_provider_whole_host_drops_it() -> None:
    async with httpx.AsyncClient() as client:
        registry = VCSCache(client=client)
        host = make_host(type="gitlab")
        provider = registry.get(host)

        registry.invalidate(host.id, "group/proj")
        assert registry.get(host) is provider

        registry.invalidate(host.id)
        assert registry.get(host) is not provider

        registry.invalidate(make_host().id)  # unknown host: nothing to do
