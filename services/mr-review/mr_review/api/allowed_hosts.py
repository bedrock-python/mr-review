"""Host-header allowlist: the API's guard against DNS rebinding.

A plain ASGI wrapper rather than a ``BaseHTTPMiddleware``, so the dispatch Server-Sent
Events pass through untouched and unbuffered.
"""

from __future__ import annotations

from collections.abc import Iterable

import structlog
from starlette.datastructures import Headers
from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Receive, Scope, Send

logger = structlog.get_logger(__name__)

ALLOW_ANY_HOST = "*"
# A page cannot make the browser send one of these names for its own origin, so DNS
# rebinding cannot reach the API through them; the container health checks use them.
LOOPBACK_HOSTS: frozenset[str] = frozenset({"localhost", "127.0.0.1", "::1"})


def normalise_host(value: str) -> str:
    """Lower-case host name of a Host header or allowlist entry, without port and IPv6 brackets."""
    host = value.strip().lower()
    if host.startswith("["):
        end = host.find("]")
        return host[1:end] if end != -1 else ""
    if host.count(":") == 1:
        host = host.partition(":")[0]
    return host.rstrip(".")


class AllowedHostsMiddleware:
    """Answer 400 to a request whose Host header is not on the allowlist.

    The API listens on loopback with no login, so a web page whose domain is re-pointed at
    127.0.0.1 (DNS rebinding) could otherwise read it — the data export included. Such a
    request still carries the attacker's host name, which is what this rejects. Loopback
    names are always accepted.
    """

    def __init__(self, app: ASGIApp, allowed_hosts: Iterable[str]) -> None:
        self.app = app
        patterns = {normalise_host(pattern) for pattern in allowed_hosts}
        self._allow_any = ALLOW_ANY_HOST in patterns
        self._exact = frozenset(p for p in patterns if not p.startswith("*.")) | LOOPBACK_HOSTS
        self._suffixes = tuple(p[1:] for p in patterns if p.startswith("*."))

    def is_allowed(self, host_header: str) -> bool:
        if self._allow_any:
            return True
        host = normalise_host(host_header)
        return host in self._exact or (bool(host) and host.endswith(self._suffixes))

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        host_header = Headers(scope=scope).get("host", "")
        if self.is_allowed(host_header):
            await self.app(scope, receive, send)
            return

        logger.warning("Rejected a request for a host name that is not allowed", host=host_header)
        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 1008})
            return
        response = PlainTextResponse(
            "Invalid host header. Add this host name to MR_REVIEW__ALLOWED_HOSTS to serve it.",
            status_code=400,
        )
        await response(scope, receive, send)
