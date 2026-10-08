"""VCS failures escaping any route map to meaningful statuses, not bare 500s.

The review endpoints have no VCS error handling of their own, so they are what this exercises.
"""

from __future__ import annotations

import time
from collections.abc import AsyncGenerator, Callable
from pathlib import Path

import httpx
import pytest
import pytest_asyncio
from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from mr_review.api import entrypoint
from mr_review.api.routers.v1.hosts import router as hosts_router
from mr_review.api.routers.v1.repos import router as repos_router
from mr_review.api.routers.v1.reviews import router as reviews_router
from mr_review.api.vcs_errors import register_vcs_error_handlers, vcs_request_error_to_http, vcs_status_error_to_http

from tests.factories.vcs_container import make_container
from tests.factories.vcs_http import RoutedTransport, json_response

pytestmark = [pytest.mark.integration, pytest.mark.http]

_MR_PATH = "/api/v4/projects/team%2Fsvc/merge_requests/7"


def _status_error(
    status_code: int, headers: dict[str, str] | None = None, body: object = None
) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", "https://gitlab.example.com/api/v4/projects/1")
    response = httpx.Response(status_code, headers=headers or {}, json=body, request=request)
    return httpx.HTTPStatusError("boom", request=request, response=response)


@pytest.mark.parametrize(
    ("upstream", "headers", "expected"),
    [
        (400, {}, 400),
        (401, {}, 401),
        (403, {}, 403),
        (403, {"X-RateLimit-Remaining": "0"}, 429),
        (403, {"Retry-After": "60"}, 429),
        (429, {}, 429),
        (404, {}, 404),
        (409, {}, 502),
        (422, {}, 422),
        (500, {}, 502),
        (503, {}, 502),
    ],
)
def test__vcs_status_error_to_http__maps_upstream_status(upstream: int, headers: dict[str, str], expected: int) -> None:
    failure = vcs_status_error_to_http(_status_error(upstream, headers))

    assert failure.status_code == expected
    assert failure.detail


@pytest.mark.parametrize("status_code", [400, 422])
def test__vcs_status_error_to_http__rejected_request__passes_status_and_host_message(status_code: int) -> None:
    body = {"message": "Validation Failed", "errors": [{"message": "per_page is too large"}]}

    failure = vcs_status_error_to_http(_status_error(status_code, body=body))

    assert failure.status_code == status_code
    assert "Validation Failed" in failure.detail


@pytest.mark.parametrize(
    ("status_code", "headers", "body"),
    [
        (403, {}, {"message": "You have exceeded a secondary rate limit. Please wait a few minutes."}),
        (403, {"Retry-After": "30"}, {"message": "slow down"}),
        (429, {"Retry-After": "30"}, None),
    ],
)
def test__vcs_status_error_to_http__github_secondary_rate_limit__is_429(
    status_code: int, headers: dict[str, str], body: object
) -> None:
    failure = vcs_status_error_to_http(_status_error(status_code, headers, body))

    assert failure.status_code == 429
    assert failure.headers.get("Retry-After") == headers.get("Retry-After")


def test__vcs_status_error_to_http__primary_limit_reset__becomes_retry_after() -> None:
    reset_at = int(time.time()) + 120
    failure = vcs_status_error_to_http(
        _status_error(403, {"X-RateLimit-Remaining": "0", "X-RateLimit-Reset": str(reset_at)})
    )

    assert failure.status_code == 429
    assert 100 <= int(failure.headers["Retry-After"]) <= 121


def test__vcs_status_error_to_http__plain_forbidden__stays_403() -> None:
    failure = vcs_status_error_to_http(_status_error(403, body={"message": "Resource not accessible by token"}))

    assert failure.status_code == 403
    assert "Retry-After" not in failure.headers


def test__vcs_request_error_to_http__timeout_is_504_other_transport_errors_502() -> None:
    request = httpx.Request("GET", "https://gitlab.example.com/")

    assert vcs_request_error_to_http(httpx.ReadTimeout("slow", request=request)).status_code == 504
    assert vcs_request_error_to_http(httpx.ConnectTimeout("slow", request=request)).status_code == 504
    assert vcs_request_error_to_http(httpx.ConnectError("refused", request=request)).status_code == 502


@pytest.fixture
def gitlab() -> RoutedTransport:
    return RoutedTransport({})


@pytest_asyncio.fixture
async def api(tmp_path: Path, gitlab: RoutedTransport) -> AsyncGenerator[AsyncClient, None]:
    app = FastAPI()
    app.include_router(hosts_router)
    app.include_router(repos_router)
    app.include_router(reviews_router)
    register_vcs_error_handlers(app)
    container = make_container(tmp_path, httpx.MockTransport(gitlab))
    setup_dishka(container, app)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    await container.close()


@pytest_asyncio.fixture
async def review_id(api: AsyncClient) -> str:
    host = await api.post(
        "/api/v1/hosts",
        json={"name": "GL", "type": "gitlab", "base_url": "https://gitlab.example.com", "token": "t"},
    )
    payload = {"host_id": host.json()["id"], "repo_path": "team/svc", "mr_iid": 7}
    review = await api.post("/api/v1/reviews", json=payload)
    return str(review.json()["id"])


def _raise(exc_type: type[httpx.RequestError]) -> Callable[[httpx.Request], httpx.Response]:
    def handler(request: httpx.Request) -> httpx.Response:
        raise exc_type("upstream trouble", request=request)

    return handler


@pytest.mark.parametrize(
    ("route", "expected"),
    [
        (json_response({"message": "401 Unauthorized"}, status_code=401), 401),
        (json_response({"message": "403 Forbidden"}, status_code=403), 403),
        (json_response({"message": "404 Not found"}, status_code=404), 404),
        (json_response({"message": "400 Bad request"}, status_code=400), 400),
        (json_response({"message": "secondary rate limit"}, status_code=403, headers={"Retry-After": "7"}), 429),
        (json_response({"message": "boom"}, status_code=500), 502),
        (_raise(httpx.ReadTimeout), 504),
        (_raise(httpx.ConnectError), 502),
    ],
)
@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("GET", "diff", None),
        ("GET", "context", None),
        ("POST", "prompt", {}),
    ],
)
async def test__review_endpoints__vcs_failure__mapped_status(
    api: AsyncClient,
    review_id: str,
    gitlab: RoutedTransport,
    route: httpx.Response | Callable[[httpx.Request], httpx.Response],
    expected: int,
    method: str,
    path: str,
    body: dict[str, object] | None,
) -> None:
    gitlab.routes[_MR_PATH] = route

    response = await api.request(method, f"/api/v1/reviews/{review_id}/{path}", json=body)

    assert response.status_code == expected
    assert response.json()["detail"]
    if expected == 429:
        assert response.headers["Retry-After"] == "7"


async def test__repos_endpoint__vcs_404__is_404(api: AsyncClient, review_id: str, gitlab: RoutedTransport) -> None:
    hosts = await api.get("/api/v1/hosts")
    host_id = hosts.json()[0]["id"]
    gitlab.routes[_MR_PATH] = json_response({"message": "404 Not found"}, status_code=404)

    response = await api.get(f"/api/v1/hosts/{host_id}/repos/team/svc/mrs/7")

    assert response.status_code == 404
    assert response.json()["detail"] == "Not found on the VCS host: /api/v4/projects/team/svc/merge_requests/7"


def test__create_app__registers_the_vcs_error_handlers(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MR_REVIEW__DATA_DIR", str(tmp_path))
    monkeypatch.setattr(entrypoint, "configure_logging", lambda **_: None)

    app = entrypoint.create_app()

    assert httpx.HTTPStatusError in app.exception_handlers
    assert httpx.RequestError in app.exception_handlers
