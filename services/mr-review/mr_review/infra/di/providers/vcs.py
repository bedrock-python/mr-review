"""VCS infrastructure providers."""

from __future__ import annotations

from collections.abc import AsyncIterable

import httpx
from dishka import Provider, Scope, provide

from mr_review.infra.vcs.cache import VCSCache


class VCSInfraProvider(Provider):
    """Provides VCS infrastructure components."""

    @provide(scope=Scope.APP)
    def get_vcs_cache(self) -> VCSCache:
        """Process-wide cache shared across all requests."""
        return VCSCache()

    @provide(scope=Scope.REQUEST)
    async def get_vcs_client(self) -> AsyncIterable[httpx.AsyncClient]:
        """Per-request httpx client for VCS API calls."""
        async with httpx.AsyncClient(timeout=60) as client:
            yield client
