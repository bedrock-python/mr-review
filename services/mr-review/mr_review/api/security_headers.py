"""Security headers and the CSP for the UI the all-in-one server serves itself.

A plain ASGI wrapper rather than a ``BaseHTTPMiddleware``, so a streamed response passes
through untouched and unbuffered.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from urllib.parse import urlsplit

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send


def build_ui_security_headers(api_base_url: str) -> dict[str, str]:
    """The headers the web-app nginx sends with the UI, for the all-in-one image to send too.

    CSP sources: ``'unsafe-inline'`` scripts for the theme bootstrap in index.html,
    ``'unsafe-inline'`` styles for React ``style`` attributes, api.github.com for the update
    check, and the API's origin when ``api_base_url`` puts it on another one. The web fonts
    are bundled with the UI, so fonts and styles come from ``'self'`` only.
    """
    connect_src = ["'self'", "https://api.github.com"]
    parts = urlsplit(api_base_url.strip())
    if parts.scheme and parts.netloc:
        connect_src.append(f"{parts.scheme}://{parts.netloc}")
    csp = "; ".join(
        [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "font-src 'self' data:",
            f"connect-src {' '.join(connect_src)}",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ]
    )
    return {
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
        "Content-Security-Policy": csp,
    }


def _is_under(path: str, prefix: str) -> bool:
    return path == prefix or path.startswith(f"{prefix}/")


class SecurityHeadersMiddleware:
    """Add security headers and the CSP to the UI's responses.

    Paths under ``skip_prefixes`` (the JSON API, its SSE stream, the Swagger pages that load
    their assets from a CDN) are passed through as they are. No HSTS: like the web container,
    this server speaks plain HTTP and cannot know which names are served over HTTPS — the
    proxy that terminates TLS sends it.
    """

    def __init__(self, app: ASGIApp, headers: Mapping[str, str], skip_prefixes: Iterable[str]) -> None:
        self.app = app
        self._headers = dict(headers)
        self._skip_prefixes = tuple(prefix.rstrip("/") for prefix in skip_prefixes)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path: str = scope.get("path", "")
        if scope["type"] != "http" or any(_is_under(path, prefix) for prefix in self._skip_prefixes):
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                for name, value in self._headers.items():
                    headers.setdefault(name, value)
            await send(message)

        await self.app(scope, receive, send_with_headers)
