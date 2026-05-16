"""In-memory TTL cache for read-only VCS API responses."""

from __future__ import annotations

import time
from typing import Any, cast
from uuid import UUID

import httpx

from mr_review.core.hosts.entities import Host
from mr_review.core.mrs.entities import MR, DiffFile, Repo
from mr_review.core.vcs.protocols import VCSProvider
from mr_review.infra.vcs.bitbucket import BitbucketProvider
from mr_review.infra.vcs.gitea import GiteaProvider
from mr_review.infra.vcs.github import GitHubProvider
from mr_review.infra.vcs.gitlab import GitLabProvider


def _build_raw_provider(host: Host, client: httpx.AsyncClient) -> VCSProvider:
    token = host.token.get_secret_value()
    if host.type == "gitlab":
        return GitLabProvider(client=client, base_url=host.base_url, token=token)
    if host.type == "github":
        return GitHubProvider(client=client, base_url=host.base_url, token=token)
    if host.type in ("gitea", "forgejo"):
        return GiteaProvider(client=client, base_url=host.base_url, token=token)
    if host.type == "bitbucket":
        return BitbucketProvider(client=client, base_url=host.base_url, token=token)
    raise ValueError(f"Unsupported host type: {host.type!r}")


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

    def swap_provider(self, provider: VCSProvider) -> None:
        """Replace the inner provider (refreshes HTTP client) while keeping TTL caches."""
        self._provider = provider

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

    async def get_diff_refs(self, repo_path: str, mr_iid: int) -> dict[str, str]:
        key = f"diff_refs:{repo_path}:{mr_iid}"
        cached = self._cache.get(key)
        if not isinstance(cached, _Miss):
            return cast(dict[str, str], cached)
        result = await self._provider.get_diff_refs(repo_path, mr_iid)
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

    async def get_file(self, repo_path: str, file_path: str, ref: str = "HEAD") -> str | None:
        key = f"file:{repo_path}:{ref}:{file_path}"
        cached = self._cache.get(key)
        if not isinstance(cached, _Miss):
            return cast("str | None", cached)
        result = await self._provider.get_file(repo_path, file_path, ref)
        self._cache.set(key, result)
        return result

    async def list_directory(self, repo_path: str, dir_path: str, ref: str = "HEAD") -> list[str]:
        key = f"dir:{repo_path}:{ref}:{dir_path}"
        cached = self._cache.get(key)
        if not isinstance(cached, _Miss):
            return cast(list[str], cached)
        result = await self._provider.list_directory(repo_path, dir_path, ref)
        self._cache.set(key, result)
        return result

    async def get_commits(
        self, repo_path: str, file_path: str, ref: str = "HEAD", limit: int = 10
    ) -> list[dict[str, str]]:
        key = f"commits:{repo_path}:{ref}:{file_path}:{limit}"
        cached = self._cache.get(key)
        if not isinstance(cached, _Miss):
            return cast("list[dict[str, str]]", cached)
        result = await self._provider.get_commits(repo_path, file_path, ref, limit)
        self._cache.set(key, result)
        return result


class VCSCache:
    """APP-scoped registry of CachedVCSProvider instances keyed by host_id.

    Lives for the lifetime of the process so cached data (TTL 5 min) is shared
    across all requests hitting the same host — diff/file/MR data fetched during
    brief-building is instantly available during dispatch without extra API calls.
    """

    def __init__(self, ttl: float = 300.0, repos_ttl: float = 900.0) -> None:
        self._ttl = ttl
        self._repos_ttl = repos_ttl
        self._providers: dict[UUID, CachedVCSProvider] = {}

    def get_or_create(self, host: Host, client: httpx.AsyncClient) -> CachedVCSProvider:
        """Return the shared CachedVCSProvider for this host, creating it if needed.

        The caller supplies a per-request httpx client.  The CachedVCSProvider
        (and its TTL stores) lives across requests; only the inner raw provider is
        swapped on each call so cache misses use the current live connection.
        """
        raw = _build_raw_provider(host, client)
        if host.id not in self._providers:
            self._providers[host.id] = CachedVCSProvider(
                provider=raw,
                ttl=self._ttl,
                repos_ttl=self._repos_ttl,
            )
        else:
            # Keep TTL stores intact, just refresh the underlying HTTP client.
            self._providers[host.id].swap_provider(raw)
        return self._providers[host.id]

    def invalidate(self, host_id: UUID) -> None:
        """Evict all cached data for a host (e.g. after a Sync action)."""
        self._providers.pop(host_id, None)
