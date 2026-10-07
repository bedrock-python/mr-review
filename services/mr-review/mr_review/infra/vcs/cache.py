"""Process-wide VCS provider registry and a bounded TTL cache of read-only VCS responses."""

from __future__ import annotations

import asyncio
import hashlib
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable, Hashable
from dataclasses import dataclass
from functools import partial
from typing import cast
from uuid import UUID

import httpx

from mr_review.core.hosts.entities import Host
from mr_review.core.mrs.entities import MR, DiffFile, InboxMR, MRStateFilter, PersonalMRScope, Repo
from mr_review.core.pagination import DEFAULT_MRS_PER_PAGE, DEFAULT_REPOS_PER_PAGE, Page
from mr_review.core.vcs.protocols import VCSProvider
from mr_review.infra.vcs.factory import build_vcs_provider


class _Miss:
    pass


_MISS = _Miss()


class TTLCache:
    """Bounded LRU cache with a per-entry TTL and single-flight loading.

    * At most ``max_entries`` live entries; the least recently used one is evicted first.
    * Expired entries are dropped when read, and swept at most once per ``ttl`` on writes, so
      values nobody reads again don't linger until the cap is reached.
    * Concurrent misses for one key share a single load. The load runs as its own task, so a
      caller that gets cancelled (a client disconnecting) neither cancels the others nor wastes
      the fetch: the result is still stored.
    * Failed loads are never stored; every caller waiting on that load gets the exception.

    Safe for concurrent use from one event loop; not thread-safe.
    """

    def __init__(self, ttl: float, max_entries: int, clock: Callable[[], float] = time.monotonic) -> None:
        if max_entries < 1:
            raise ValueError("max_entries must be at least 1")
        self._ttl = ttl
        self._max_entries = max_entries
        self._clock = clock
        self._data: OrderedDict[Hashable, tuple[object, float]] = OrderedDict()
        self._inflight: dict[Hashable, asyncio.Task[object]] = {}
        self._next_sweep = clock() + ttl

    def __len__(self) -> int:
        return len(self._data)

    async def get_or_load[T](self, key: Hashable, loader: Callable[[], Awaitable[T]]) -> T:
        value = self._get(key)
        if not isinstance(value, _Miss):
            return cast(T, value)
        task = self._inflight.get(key)
        if task is None:
            task = asyncio.get_running_loop().create_task(self._load(key, loader))
            self._inflight[key] = task
            task.add_done_callback(partial(self._forget_load, key))
        return cast(T, await asyncio.shield(task))

    async def _load(self, key: Hashable, loader: Callable[[], Awaitable[object]]) -> object:
        value = await loader()
        self._set(key, value)
        return value

    def _forget_load(self, key: Hashable, task: asyncio.Task[object]) -> None:
        if self._inflight.get(key) is task:
            del self._inflight[key]
        if not task.cancelled():
            # Mark the exception as retrieved: when every waiter was cancelled nobody else will.
            task.exception()

    def _get(self, key: Hashable) -> object:
        entry = self._data.get(key)
        if entry is None:
            return _MISS
        value, expires_at = entry
        if self._clock() >= expires_at:
            del self._data[key]
            return _MISS
        self._data.move_to_end(key)
        return value

    def _set(self, key: Hashable, value: object) -> None:
        now = self._clock()
        self._data[key] = (value, now + self._ttl)
        self._data.move_to_end(key)
        if now >= self._next_sweep or len(self._data) > self._max_entries:
            self._sweep_expired(now)
        while len(self._data) > self._max_entries:
            self._data.popitem(last=False)

    def _sweep_expired(self, now: float) -> None:
        expired = [key for key, (_, expires_at) in self._data.items() if now >= expires_at]
        for key in expired:
            del self._data[key]
        self._next_sweep = now + self._ttl


class CachedVCSProvider:
    """Wraps a VCSProvider and caches read-only responses.

    Three stores keep heavy content from evicting cheap metadata:

    * repository listings (longer TTL — they change rarely),
    * metadata (MR pages, single MRs, diff refs, directory listings, commits),
    * content (diffs and file bodies).

    Write methods (post_inline_comment, post_general_note) and test_connection bypass the cache.
    """

    def __init__(
        self,
        provider: VCSProvider,
        ttl: float = 300.0,
        repos_ttl: float = 900.0,
        max_entries: int = 1024,
        max_content_entries: int = 256,
        max_repo_entries: int = 256,
    ) -> None:
        self._provider = provider
        self._repos = TTLCache(repos_ttl, max_repo_entries)
        self._meta = TTLCache(ttl, max_entries)
        self._content = TTLCache(ttl, max_content_entries)

    async def test_connection(self) -> dict[str, str]:
        return await self._provider.test_connection()

    async def list_repos(
        self, query: str | None = None, page: int = 1, per_page: int = DEFAULT_REPOS_PER_PAGE
    ) -> Page[Repo]:
        # Search results are ad hoc: keep them under the short TTL.
        store = self._meta if query else self._repos
        return await store.get_or_load(
            ("repos", query or "", page, per_page),
            lambda: self._provider.list_repos(query=query, page=page, per_page=per_page),
        )

    async def get_repo(self, repo_path: str) -> Repo:
        return await self._meta.get_or_load(("repo", repo_path), lambda: self._provider.get_repo(repo_path))

    async def list_mrs(
        self,
        repo_path: str,
        state: MRStateFilter = "opened",
        page: int = 1,
        per_page: int = DEFAULT_MRS_PER_PAGE,
        query: str | None = None,
    ) -> Page[MR]:
        return await self._meta.get_or_load(
            ("mrs", repo_path, state, page, per_page, query or ""),
            lambda: self._provider.list_mrs(repo_path, state=state, page=page, per_page=per_page, query=query),
        )

    async def list_my_mrs(
        self, scope: PersonalMRScope, page: int = 1, per_page: int = DEFAULT_MRS_PER_PAGE
    ) -> Page[InboxMR]:
        return await self._meta.get_or_load(
            ("my_mrs", scope, page, per_page),
            lambda: self._provider.list_my_mrs(scope, page=page, per_page=per_page),
        )

    async def get_mr(self, repo_path: str, mr_iid: int) -> MR:
        return await self._meta.get_or_load(("mr", repo_path, mr_iid), lambda: self._provider.get_mr(repo_path, mr_iid))

    async def get_diff(self, repo_path: str, mr_iid: int) -> list[DiffFile]:
        return await self._content.get_or_load(
            ("diff", repo_path, mr_iid), lambda: self._provider.get_diff(repo_path, mr_iid)
        )

    async def get_branch_diff(self, repo_path: str, base_ref: str, head_ref: str) -> list[DiffFile]:
        return await self._content.get_or_load(
            ("branch_diff", repo_path, base_ref, head_ref),
            lambda: self._provider.get_branch_diff(repo_path, base_ref, head_ref),
        )

    async def get_diff_refs(self, repo_path: str, mr_iid: int) -> dict[str, str]:
        return await self._meta.get_or_load(
            ("diff_refs", repo_path, mr_iid), lambda: self._provider.get_diff_refs(repo_path, mr_iid)
        )

    async def post_inline_comment(
        self,
        repo_path: str,
        mr_iid: int,
        diff_refs: dict[str, str],
        file: str,
        line: int,
        body: str,
    ) -> None:
        await self._provider.post_inline_comment(repo_path, mr_iid, diff_refs, file, line, body)

    async def post_general_note(self, repo_path: str, mr_iid: int, body: str) -> None:
        await self._provider.post_general_note(repo_path, mr_iid, body)

    async def get_file(self, repo_path: str, file_path: str, ref: str = "HEAD") -> str | None:
        return await self._content.get_or_load(
            ("file", repo_path, ref, file_path), lambda: self._provider.get_file(repo_path, file_path, ref)
        )

    async def list_directory(self, repo_path: str, dir_path: str, ref: str = "HEAD") -> list[str]:
        return await self._meta.get_or_load(
            ("dir", repo_path, ref, dir_path), lambda: self._provider.list_directory(repo_path, dir_path, ref)
        )

    async def get_commits(
        self, repo_path: str, file_path: str, ref: str = "HEAD", limit: int = 10
    ) -> list[dict[str, str]]:
        return await self._meta.get_or_load(
            ("commits", repo_path, ref, file_path, limit),
            lambda: self._provider.get_commits(repo_path, file_path, ref, limit),
        )


def _host_fingerprint(host: Host) -> str:
    """Identify everything a built provider depends on, without keeping the token itself around."""
    material = "\0".join((host.type, host.base_url, host.token.get_secret_value()))
    return hashlib.sha256(material.encode()).hexdigest()


@dataclass(frozen=True)
class _RegistryEntry:
    fingerprint: str
    provider: CachedVCSProvider


class VCSCache:
    """APP-scoped registry of CachedVCSProvider instances, one per host.

    Every provider runs on the one shared, app-scoped ``httpx.AsyncClient`` (pooled keep-alive
    connections), so a provider is built once per host and reused by every request. It is rebuilt
    — with empty caches — when the host's type, base URL or token changes.
    """

    def __init__(
        self,
        client: httpx.AsyncClient,
        ttl: float = 300.0,
        repos_ttl: float = 900.0,
        max_entries: int = 1024,
        max_content_entries: int = 256,
        max_repo_entries: int = 256,
    ) -> None:
        self._client = client
        self._ttl = ttl
        self._repos_ttl = repos_ttl
        self._max_entries = max_entries
        self._max_content_entries = max_content_entries
        self._max_repo_entries = max_repo_entries
        self._entries: dict[UUID, _RegistryEntry] = {}

    def get(self, host: Host) -> CachedVCSProvider:
        """Return the shared CachedVCSProvider for ``host``, (re)building it when the host changed."""
        fingerprint = _host_fingerprint(host)
        entry = self._entries.get(host.id)
        if entry is None or entry.fingerprint != fingerprint:
            provider = CachedVCSProvider(
                build_vcs_provider(host, self._client),
                ttl=self._ttl,
                repos_ttl=self._repos_ttl,
                max_entries=self._max_entries,
                max_content_entries=self._max_content_entries,
                max_repo_entries=self._max_repo_entries,
            )
            entry = _RegistryEntry(fingerprint=fingerprint, provider=provider)
            self._entries[host.id] = entry
        return entry.provider

    def invalidate(self, host_id: UUID) -> None:
        """Evict the provider and all cached data for a host (e.g. after a Sync action)."""
        self._entries.pop(host_id, None)
