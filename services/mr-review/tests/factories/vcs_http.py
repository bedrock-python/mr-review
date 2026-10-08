"""A tiny routed ``httpx.MockTransport`` for exercising the VCS providers without a network."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import httpx

Handler = Callable[[httpx.Request], httpx.Response]


def raw_path(request: httpx.Request) -> str:
    """The path as sent on the wire: percent-escapes such as GitLab's ``%2F`` stay intact."""
    return request.url.raw_path.decode().split("?", 1)[0]


def json_response(body: Any, headers: dict[str, str] | None = None, status_code: int = 200) -> httpx.Response:
    return httpx.Response(status_code, json=body, headers=headers or {})


class RoutedTransport:
    """Dispatches by URL path, records every request, and fails loudly on an unexpected path."""

    def __init__(self, routes: dict[str, Handler | httpx.Response]) -> None:
        self.routes = routes
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        route = self.routes.get(raw_path(request))
        if route is None:
            return httpx.Response(599, json={"unexpected_path": raw_path(request)})
        return route(request) if callable(route) else route

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self))

    def paths(self) -> list[str]:
        return [raw_path(request) for request in self.requests]

    def last_params(self) -> httpx.QueryParams:
        return self.requests[-1].url.params
