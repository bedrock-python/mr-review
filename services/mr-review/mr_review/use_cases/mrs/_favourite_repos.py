"""Shared helper: merge pinned favourites into a paginated VCS listing."""

from __future__ import annotations

import asyncio
import logging

from mr_review.core.hosts.entities import Host
from mr_review.core.mrs.entities import Repo
from mr_review.core.vcs.protocols import VCSProvider

logger = logging.getLogger(__name__)

# Favourites are user-pinned and few, but each one missing from the listing costs a lookup.
_FAVOURITE_FETCH_CONCURRENCY = 5


def matches_query(repo: Repo, query: str | None) -> bool:
    """Case-insensitive match of ``query`` against a repo's path or name; no query matches everything."""
    if not query:
        return True
    needle = query.lower()
    return needle in repo.path.lower() or needle in repo.name.lower()


async def fetch_extra_favourites(
    provider: VCSProvider,
    host: Host,
    listed: list[Repo],
    query: str | None = None,
) -> list[Repo]:
    """Return the host's favourite repos that aren't already in ``listed``.

    Useful for surfacing public/non-member repos the user has explicitly pinned —
    membership-based listings (GitHub ``/user/repos``, GitLab ``membership=true``)
    otherwise hide them. Failed fetches are logged and skipped silently. When a
    query is supplied, the fetched extras are filtered to those whose path/name
    contain the query (case-insensitive).
    """
    listed_paths = {r.path for r in listed}
    missing = [p for p in host.favourite_repos if p not in listed_paths]
    if not missing:
        return []

    semaphore = asyncio.Semaphore(_FAVOURITE_FETCH_CONCURRENCY)

    async def fetch(repo_path: str) -> Repo | None:
        async with semaphore:
            return await _safe_get_repo(provider, repo_path)

    fetched = await asyncio.gather(*[fetch(p) for p in missing])
    return [r for r in fetched if r is not None and matches_query(r, query)]


def merge_favourites_into_page(
    host: Host,
    page: int,
    listed: list[Repo],
    extras: list[Repo],
    query: str | None,
) -> list[Repo]:
    """Merge favourites into one page of a listing so each favourite shows up exactly once.

    Page 1 gets ``extras`` (favourites missing from it) in front. A favourite the host
    lists on a later page was already prepended to page 1, so later pages drop it.
    """
    if page == 1:
        return [*extras, *listed]
    favourites = set(host.favourite_repos)
    return [r for r in listed if not (r.path in favourites and matches_query(r, query))]


async def _safe_get_repo(provider: VCSProvider, repo_path: str) -> Repo | None:
    try:
        return await provider.get_repo(repo_path)
    except Exception:
        logger.warning("Failed to fetch favourite repo %s", repo_path, exc_info=True)
        return None
