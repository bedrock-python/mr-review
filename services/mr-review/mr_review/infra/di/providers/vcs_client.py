"""VCS HTTP client provider."""

from __future__ import annotations

from collections.abc import AsyncIterable

import httpx
from dishka import Provider, Scope, provide


class VCSClientProvider(Provider):
    """Provides a shared httpx.AsyncClient for VCS API calls per request."""

    scope = Scope.REQUEST

    @provide
    async def get_vcs_client(self) -> AsyncIterable[httpx.AsyncClient]:
        async with httpx.AsyncClient(timeout=60) as client:
            yield client
