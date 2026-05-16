from __future__ import annotations

import httpx

from mr_review.core.hosts.entities import Host
from mr_review.core.vcs.protocols import VCSProvider
from mr_review.infra.vcs.cache import CachedVCSProvider, VCSCache, _build_raw_provider


def create_vcs_provider(host: Host, client: httpx.AsyncClient, cached: bool = True) -> VCSProvider:
    provider = _build_raw_provider(host, client)
    if cached:
        return CachedVCSProvider(provider)
    return provider


def get_cached_provider(host: Host, client: httpx.AsyncClient, vcs_cache: VCSCache) -> CachedVCSProvider:
    """Return the process-wide CachedVCSProvider for this host.

    The CachedVCSProvider (and its TTL store) lives in *vcs_cache* across all
    requests.  Each call swaps the inner raw provider to use the current
    request's httpx client for any cache misses.
    """
    return vcs_cache.get_or_create(host, client)
