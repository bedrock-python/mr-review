"""VCS infrastructure providers."""

from __future__ import annotations

from collections.abc import AsyncIterable

import httpx
from dishka import Provider, Scope, provide

from mr_review.api.config import Settings
from mr_review.infra.vcs.cache import VCSCache

# One pool for every VCS host. The inbox fans out over a few repositories at a time and context
# collection fetches five files at a time per review, so a few dozen sockets cover a busy UI;
# idle keep-alive connections are what save the TCP/TLS handshake on the next request.
_MAX_CONNECTIONS = 64
_MAX_KEEPALIVE_CONNECTIONS = 32
_KEEPALIVE_EXPIRY_SECONDS = 60.0


class VCSInfraProvider(Provider):
    """Provides VCS infrastructure components, all living for the whole process."""

    scope = Scope.APP

    @provide
    async def get_vcs_client(self, settings: Settings) -> AsyncIterable[httpx.AsyncClient]:
        """Shared pooled HTTP client for every VCS API call; closed when the container closes."""
        async with httpx.AsyncClient(
            timeout=settings.vcs_timeout,
            limits=httpx.Limits(
                max_connections=_MAX_CONNECTIONS,
                max_keepalive_connections=_MAX_KEEPALIVE_CONNECTIONS,
                keepalive_expiry=_KEEPALIVE_EXPIRY_SECONDS,
            ),
        ) as client:
            yield client

    @provide
    def get_vcs_cache(self, client: httpx.AsyncClient) -> VCSCache:
        """Process-wide provider registry and response cache shared across all requests."""
        return VCSCache(client=client)
