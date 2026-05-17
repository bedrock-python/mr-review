"""Shared helper: merge pinned non-member favourites into a VCS listing."""

from __future__ import annotations

import asyncio
import logging

from mr_review.core.hosts.entities import Host
from mr_review.core.mrs.entities import Repo
from mr_review.core.vcs.protocols import VCSProvider

logger = logging.getLogger(__name__)


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

    fetched = await asyncio.gather(*[_safe_get_repo(provider, p) for p in missing])
    extras = [r for r in fetched if r is not None]

    if query:
        needle = query.lower()
        extras = [r for r in extras if needle in r.path.lower() or needle in r.name.lower()]
    return extras


async def _safe_get_repo(provider: VCSProvider, repo_path: str) -> Repo | None:
    try:
        return await provider.get_repo(repo_path)
    except Exception:
        logger.warning("Failed to fetch favourite repo %s", repo_path, exc_info=True)
        return None
