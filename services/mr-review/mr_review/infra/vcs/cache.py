"""Process-wide VCS provider registry and a bounded TTL cache of read-only VCS responses."""

from __future__ import annotations

import asyncio
import hashlib
import itertools
import time
from collections import OrderedDict
from collections.abc import AsyncIterator, Awaitable, Callable, Hashable, Sequence
from dataclasses import dataclass
from functools import partial
from typing import cast
from uuid import UUID

import httpx

from mr_review.core.hosts.entities import Host
from mr_review.core.mrs.entities import MR, DiffFile, InboxMR, MRStateFilter, PersonalMRScope, Repo
from mr_review.core.pagination import DEFAULT_MRS_PER_PAGE, DEFAULT_REPOS_PER_PAGE, Page
from mr_review.core.vcs.entities import InlineComment, PostResult
from mr_review.core.vcs.protocols import VCSProvider
from mr_review.infra.vcs._tree import WholeTreeListing, files_under
from mr_review.infra.vcs.factory import build_vcs_provider


class _Miss:
    pass


_MISS = _Miss()


_STR_OVERHEAD = 50
_OBJECT_OVERHEAD = 64
_DIFF_LINE_OVERHEAD = 400


def approximate_size(value: object) -> int:
    """Rough in-memory footprint of a cached VCS response, in bytes.

    Exact accounting is not the point; the byte cap only has to stop a few huge diffs or trees
    from holding hundreds of megabytes. Parsed diff lines dominate, at a few hundred bytes each
    on top of their text.
    """
    if value is None:
        return 0
    if isinstance(value, str):
        return len(value) + _STR_OVERHEAD
    if isinstance(value, DiffFile):
        lines = sum(len(hunk.lines) for hunk in value.hunks)
        text = sum(len(line.content) for hunk in value.hunks for line in hunk.lines)
        return text + lines * _DIFF_LINE_OVERHEAD + len(value.path) + _OBJECT_OVERHEAD
    if isinstance(value, list | tuple):
        return sum(approximate_size(item) for item in value) + _OBJECT_OVERHEAD
    return _OBJECT_OVERHEAD


@dataclass
class _Entry:
    value: object
    expires_at: float
    size: int


class TTLCache:
    """Bounded LRU cache with a per-entry TTL and single-flight loading.

    * At most ``max_entries`` live entries — and, when ``max_bytes`` is set, at most that many
      bytes as estimated by ``sizer``; the least recently used entries are evicted first, and a
      value bigger than the whole budget is returned but never stored.
    * Expired entries are dropped when read, and swept at most once per ``ttl`` on writes, so
      values nobody reads again don't linger until the cap is reached.
    * Concurrent misses for one key share a single load. The load runs as its own task, so a
      caller that gets cancelled (a client disconnecting) neither cancels the others nor wastes
      the fetch: the result is still stored.
    * Failed loads are never stored; every caller waiting on that load gets the exception.
    * ``invalidate`` drops entries; a load that was already running when it was called still
      answers its callers but is not stored, since its result may predate the invalidation.

    Safe for concurrent use from one event loop; not thread-safe.
    """

    def __init__(
        self,
        ttl: float,
        max_entries: int,
        clock: Callable[[], float] = time.monotonic,
        max_bytes: int | None = None,
        sizer: Callable[[object], int] = approximate_size,
    ) -> None:
        if max_entries < 1:
            raise ValueError("max_entries must be at least 1")
        if max_bytes is not None and max_bytes < 1:
            raise ValueError("max_bytes must be at least 1")
        self._ttl = ttl
        self._max_entries = max_entries
        self._max_bytes = max_bytes
        self._sizer = sizer
        self._clock = clock
        self._data: OrderedDict[Hashable, _Entry] = OrderedDict()
        self._bytes = 0
        self._inflight: dict[Hashable, asyncio.Task[object]] = {}
        self._next_sweep = clock() + ttl
        self._generation = 0

    def __len__(self) -> int:
        return len(self._data)

    @property
    def size_bytes(self) -> int:
        """Estimated bytes held (0 when no byte cap is configured)."""
        return self._bytes

    async def get_or_load[T](self, key: Hashable, loader: Callable[[], Awaitable[T]]) -> T:
        value = self._get(key)
        if not isinstance(value, _Miss):
            return cast(T, value)
        task = self._inflight.get(key)
        if task is None:
            # The generation is taken now, not when the task first runs: an invalidation in between
            # must still keep this load's (possibly stale) result out of the cache.
            task = asyncio.get_running_loop().create_task(self._load(key, loader, self._generation))
            self._inflight[key] = task
            task.add_done_callback(partial(self._forget_load, key))
        return cast(T, await asyncio.shield(task))

    def invalidate(self, predicate: Callable[[Hashable], bool] | None = None) -> None:
        """Drop the entries whose key matches ``predicate`` — every entry when there is none."""
        self._generation += 1
        if predicate is None:
            self._data.clear()
            self._bytes = 0
            self._inflight.clear()
            return
        for key in [key for key in self._data if predicate(key)]:
            self._drop(key)
        # Later callers must start a fresh load rather than join one that began before this call.
        for key in [key for key in self._inflight if predicate(key)]:
            del self._inflight[key]

    async def _load(self, key: Hashable, loader: Callable[[], Awaitable[object]], generation: int) -> object:
        value = await loader()
        if generation == self._generation:
            self._set(key, value)
        return value

    def _forget_load(self, key: Hashable, task: asyncio.Task[object]) -> None:
        if self._inflight.get(key) is task:
            del self._inflight[key]
        if not task.cancelled():
            # Mark the exception as retrieved: when every waiter was cancelled nobody else will.
            task.exception()

    def peek(self, key: Hashable) -> object:
        """The live value under ``key`` without loading anything; ``MISS`` when there is none."""
        return self._get(key)

    def discard(self, key: Hashable) -> None:
        if key in self._data:
            self._drop(key)

    def _drop(self, key: Hashable) -> None:
        self._bytes -= self._data.pop(key).size

    def _get(self, key: Hashable) -> object:
        entry = self._data.get(key)
        if entry is None:
            return _MISS
        if self._clock() >= entry.expires_at:
            self._drop(key)
            return _MISS
        self._data.move_to_end(key)
        return entry.value

    def _set(self, key: Hashable, value: object) -> None:
        now = self._clock()
        self.discard(key)
        size = self._sizer(value) if self._max_bytes is not None else 0
        if self._max_bytes is not None and size > self._max_bytes:
            return
        self._data[key] = _Entry(value=value, expires_at=now + self._ttl, size=size)
        self._bytes += size
        if now >= self._next_sweep or self._is_over_budget():
            self._sweep_expired(now)
        while self._is_over_budget():
            oldest = next(iter(self._data))
            self._drop(oldest)

    def _is_over_budget(self) -> bool:
        if len(self._data) > self._max_entries:
            return True
        return self._max_bytes is not None and self._bytes > self._max_bytes

    def _sweep_expired(self, now: float) -> None:
        for key in [key for key, entry in self._data.items() if now >= entry.expires_at]:
            self._drop(key)
        self._next_sweep = now + self._ttl


# Per host: diffs, trees and file bodies beyond this estimated size are evicted, oldest first.
DEFAULT_MAX_CONTENT_BYTES = 128 * 1024 * 1024

# A later page is cached only when fetched within this many seconds of the first page it follows.
# Listings are sorted by activity, so a page fetched long after page 1 may have lost items to it.
PAGE_COHERENCE_SECONDS = 10.0


@dataclass(frozen=True)
class _FirstPage:
    """Page 1 of a listing, and the snapshot generation its later pages are cached under."""

    page: object
    item_keys: frozenset[Hashable]
    generation: int
    fetched_at: float


class _StaleFirstPage(Exception):  # noqa: N818 - a signal carrying the page, not an error
    """A later page that proves the cached page 1 out of date; carried out of the single-flight load."""

    def __init__(self, page: object) -> None:
        super().__init__("cached first page is stale")
        self.page = page


def _repo_key(repo: Repo) -> Hashable:
    return repo.path


def _mr_key(mr: MR) -> Hashable:
    return mr.iid


def _inbox_mr_key(item: InboxMR) -> Hashable:
    return (item.repo_path, item.mr.iid)


# Cache key kinds that belong to one repository; the repository path is the key's second element.
_REPO_SCOPED_KINDS = frozenset(
    {"repo", "mrs", "mr", "diff", "branch_diff", "diff_refs", "file", "dir", "tree", "commits"}
)


# Host-wide MR listings that can contain any repository's MRs (the personal inbox scopes).
_CROSS_REPO_MR_KINDS = frozenset({"my_mrs"})


def _affected_by_repo(repo_path: str) -> Callable[[Hashable], bool]:
    """Keys holding data of ``repo_path``: its own entries, plus the listings that mix in its MRs."""

    def predicate(key: Hashable) -> bool:
        if not isinstance(key, tuple) or not key:
            return False
        if key[0] in _CROSS_REPO_MR_KINDS:
            return True
        return len(key) > 1 and key[0] in _REPO_SCOPED_KINDS and key[1] == repo_path

    return predicate


class CachedVCSProvider:
    """Wraps a VCSProvider and caches read-only responses.

    Three stores keep heavy content from evicting cheap metadata:

    * repository listings (longer TTL — they change rarely),
    * metadata (MR pages, single MRs, diff refs, directory listings, commits),
    * content (diffs and file bodies).

    Listing pages are kept coherent with their first page: listings are sorted by activity, so
    pages fetched minutes apart can disagree (a repository pushed to moves from page 3 to page 1
    and shows up on neither). Later pages are therefore cached under the generation of the
    page-1 snapshot they were fetched with: a new page 1 makes them unreachable, and a later page
    that has to be fetched well after its page 1 retires that snapshot instead of being cached,
    so the next load of the list starts again from a fresh page 1.

    Write methods (post_inline_comments, post_general_note) and test_connection bypass the cache.
    """

    def __init__(
        self,
        provider: VCSProvider,
        ttl: float = 300.0,
        repos_ttl: float = 900.0,
        max_entries: int = 1024,
        max_content_entries: int = 256,
        max_repo_entries: int = 256,
        clock: Callable[[], float] = time.monotonic,
        max_content_bytes: int = DEFAULT_MAX_CONTENT_BYTES,
    ) -> None:
        self._provider = provider
        self._clock = clock
        self._repos = TTLCache(repos_ttl, max_repo_entries, clock=clock)
        self._meta = TTLCache(ttl, max_entries, clock=clock)
        # Diffs, trees and files vary from bytes to tens of megabytes: cap them by size too.
        self._content = TTLCache(ttl, max_content_entries, clock=clock, max_bytes=max_content_bytes)
        self._generations = itertools.count(1)

    def invalidate(self, repo_path: str | None = None) -> None:
        """Forget cached responses: one repository's (MRs, diffs, files, ...) or, without a path, all.

        A repository's MRs also appear in the personal inbox listings, so those go with it.
        """
        predicate = _affected_by_repo(repo_path) if repo_path is not None else None
        for store in (self._repos, self._meta, self._content):
            store.invalidate(predicate)

    async def test_connection(self) -> dict[str, str]:
        return await self._provider.test_connection()

    async def _paged[I](
        self,
        store: TTLCache,
        family: tuple[Hashable, ...],
        page: int,
        load: Callable[[], Awaitable[Page[I]]],
        item_key: Callable[[I], Hashable],
    ) -> Page[I]:
        """One page of a listing, cached coherently with the listing's page 1 (see the class docstring)."""
        first_key = (*family, 1)
        if page == 1:
            first = await store.get_or_load(first_key, partial(self._load_first_page, load, item_key))
            return cast(Page[I], first.page)
        first_page = store.peek(first_key)
        if not isinstance(first_page, _FirstPage):
            # No page 1 to be coherent with: answer from the host and keep it out of the cache.
            return await load()
        page_key = (*family, page, first_page.generation)
        cached = store.peek(page_key)
        if not isinstance(cached, _Miss):
            return cast(Page[I], cached)
        if self._clock() - first_page.fetched_at > PAGE_COHERENCE_SECONDS:
            self._retire_first_page(store, first_key, first_page)
            return await load()
        try:
            return await store.get_or_load(page_key, partial(self._load_later_page, load, item_key, first_page))
        except _StaleFirstPage as stale:
            self._retire_first_page(store, first_key, first_page)
            return cast(Page[I], stale.page)

    async def _load_first_page[I](
        self, load: Callable[[], Awaitable[Page[I]]], item_key: Callable[[I], Hashable]
    ) -> _FirstPage:
        page = await load()
        return _FirstPage(
            page=page,
            item_keys=frozenset(item_key(item) for item in page.items),
            generation=next(self._generations),
            fetched_at=self._clock(),
        )

    @staticmethod
    async def _load_later_page[I](
        load: Callable[[], Awaitable[Page[I]]], item_key: Callable[[I], Hashable], first_page: _FirstPage
    ) -> Page[I]:
        page = await load()
        # Activity moves items to the top, pushing the tail of page 1 onto page 2: an item of the
        # cached page 1 showing up again means items moved, and the one that moved up is on neither.
        if any(item_key(item) in first_page.item_keys for item in page.items):
            raise _StaleFirstPage(page)
        return page

    @staticmethod
    def _retire_first_page(store: TTLCache, first_key: Hashable, first_page: _FirstPage) -> None:
        # Only the snapshot this page was checked against: a newer page 1 may already be in place.
        if store.peek(first_key) is first_page:
            store.discard(first_key)

    async def list_repos(
        self, query: str | None = None, page: int = 1, per_page: int = DEFAULT_REPOS_PER_PAGE
    ) -> Page[Repo]:
        # Search results are ad hoc: keep them under the short TTL.
        store = self._meta if query else self._repos
        return await self._paged(
            store,
            ("repos", query or "", per_page),
            page,
            lambda: self._provider.list_repos(query=query, page=page, per_page=per_page),
            _repo_key,
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
        return await self._paged(
            self._meta,
            ("mrs", repo_path, state, query or "", per_page),
            page,
            lambda: self._provider.list_mrs(repo_path, state=state, page=page, per_page=per_page, query=query),
            _mr_key,
        )

    async def list_my_mrs(
        self, scope: PersonalMRScope, page: int = 1, per_page: int = DEFAULT_MRS_PER_PAGE
    ) -> Page[InboxMR]:
        return await self._paged(
            self._meta,
            ("my_mrs", scope, per_page),
            page,
            lambda: self._provider.list_my_mrs(scope, page=page, per_page=per_page),
            _inbox_mr_key,
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

    def post_inline_comments(
        self,
        repo_path: str,
        mr_iid: int,
        diff_refs: dict[str, str],
        comments: Sequence[InlineComment],
    ) -> AsyncIterator[PostResult]:
        return self._provider.post_inline_comments(repo_path, mr_iid, diff_refs, comments)

    async def post_general_note(self, repo_path: str, mr_iid: int, body: str) -> PostResult:
        return await self._provider.post_general_note(repo_path, mr_iid, body)

    async def get_file(self, repo_path: str, file_path: str, ref: str = "HEAD") -> str | None:
        return await self._content.get_or_load(
            ("file", repo_path, ref, file_path), lambda: self._provider.get_file(repo_path, file_path, ref)
        )

    async def list_directory(self, repo_path: str, dir_path: str, ref: str = "HEAD") -> list[str]:
        provider = self._provider
        if isinstance(provider, WholeTreeListing):
            # Context gathering lists many directories per review: fetch the whole tree once per ref.
            tree = await self._content.get_or_load(("tree", repo_path, ref), lambda: provider.list_tree(repo_path, ref))
            return files_under(tree, dir_path)
        return await self._meta.get_or_load(
            ("dir", repo_path, ref, dir_path), lambda: provider.list_directory(repo_path, dir_path, ref)
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
        max_content_bytes: int = DEFAULT_MAX_CONTENT_BYTES,
    ) -> None:
        self._client = client
        self._max_content_bytes = max_content_bytes
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
                max_content_bytes=self._max_content_bytes,
            )
            entry = _RegistryEntry(fingerprint=fingerprint, provider=provider)
            self._entries[host.id] = entry
        return entry.provider

    def invalidate(self, host_id: UUID, repo_path: str | None = None) -> None:
        """Forget a host's cached responses — only one repository's when ``repo_path`` is given.

        Without a path the host's provider goes too, so the next request starts from scratch
        (including the user lookups some providers keep).
        """
        entry = self._entries.get(host_id)
        if entry is None:
            return
        # Clear the stores as well: a request still holding this provider must not read stale data.
        entry.provider.invalidate(repo_path)
        if repo_path is None:
            del self._entries[host_id]
