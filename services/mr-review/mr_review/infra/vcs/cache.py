"""In-memory TTL cache for read-only VCS API responses."""

from __future__ import annotations

import time
from typing import Any, cast

from mr_review.core.mrs.entities import MR, DiffFile, Repo
from mr_review.core.vcs.protocols import VCSProvider


class _TTLStore:
    """Thread-unsafe but asyncio-safe dict with per-entry TTL."""

    def __init__(self, ttl: float) -> None:
        self._ttl = ttl
        self._data: dict[str, tuple[Any, float]] = {}

    def get(self, key: str) -> Any:
        entry = self._data.get(key)
        if entry is None:
            return _MISS
        value, expires_at = entry
        if time.monotonic() > expires_at:
            del self._data[key]
            return _MISS
        return value

    def set(self, key: str, value: Any) -> None:
        self._data[key] = (value, time.monotonic() + self._ttl)

    def invalidate(self, prefix: str) -> None:
        keys = [k for k in self._data if k.startswith(prefix)]
        for k in keys:
            del self._data[k]


class _Miss:
    pass


_MISS = _Miss()


class CachedVCSProvider:
    """Wraps a VCSProvider and caches read-only responses with a TTL.

    Write methods (post_inline_comment, post_general_note) bypass the cache.
    list_repos TTL is longer — repo lists change rarely.
    """

    def __init__(self, provider: VCSProvider, ttl: float = 300.0, repos_ttl: float = 900.0) -> None:
        self._provider = provider
        self._cache = _TTLStore(ttl)
        self._repos_cache = _TTLStore(repos_ttl)

    async def test_connection(self) -> dict[str, str]:
        return await self._provider.test_connection()

    async def list_repos(self, query: str | None = None) -> list[Repo]:
        key = f"repos:{query or ''}"
        cached = self._repos_cache.get(key)
        if not isinstance(cached, _Miss):
            return cast(list[Repo], cached)
        result = await self._provider.list_repos(query=query)
        # Don't cache search results with long TTL — only cache the full listing
        if query is None:
            self._repos_cache.set(key, result)
        return result

    async def list_mrs(self, repo_path: str, state: str = "opened") -> list[MR]:
        key = f"mrs:{repo_path}:{state}"
        cached = self._cache.get(key)
        if not isinstance(cached, _Miss):
            return cast(list[MR], cached)
        result = await self._provider.list_mrs(repo_path, state)
        self._cache.set(key, result)
        return result

    async def get_mr(self, repo_path: str, mr_iid: int) -> MR:
        key = f"mr:{repo_path}:{mr_iid}"
        cached = self._cache.get(key)
        if not isinstance(cached, _Miss):
            return cast(MR, cached)
        result = await self._provider.get_mr(repo_path, mr_iid)
        self._cache.set(key, result)
        return result

    async def get_diff(self, repo_path: str, mr_iid: int) -> list[DiffFile]:
        key = f"diff:{repo_path}:{mr_iid}"
        cached = self._cache.get(key)
        if not isinstance(cached, _Miss):
            return cast(list[DiffFile], cached)
        result = await self._provider.get_diff(repo_path, mr_iid)
        self._cache.set(key, result)
        return result

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
