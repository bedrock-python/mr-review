"""Paginated list endpoints over HTTP: envelope, defaults, validation and VCS error mapping.

The full DI container runs; only the shared VCS client is pointed at a mock GitLab.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

import httpx
import pytest
import pytest_asyncio
from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from mr_review.api.routers.v1.hosts import router as hosts_router
from mr_review.api.routers.v1.repos import router as repos_router

from tests.factories.vcs_container import make_container
from tests.factories.vcs_http import RoutedTransport, json_response

pytestmark = [pytest.mark.integration, pytest.mark.http]

_API = "/api/v4"


def _project(i: int) -> dict[str, Any]:
    return {"id": i, "path_with_namespace": f"group/p{i}", "name": f"p{i}", "description": None}


def _mr(iid: int, project: str = "group/p1", updated: str = "2026-01-02T00:00:00Z") -> dict[str, Any]:
    return {
        "iid": iid,
        "title": f"MR {iid}",
        "description": "",
        "author": {"username": "dev"},
        "source_branch": "feature",
        "target_branch": "main",
        "state": "opened",
        "draft": False,
        "web_url": f"https://gitlab.example.com/{project}/-/merge_requests/{iid}",
        "references": {"full": f"{project}!{iid}"},
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": updated,
    }


@pytest.fixture
def gitlab() -> RoutedTransport:
    return RoutedTransport(
        {
            f"{_API}/projects": json_response([_project(1), _project(2)], headers={"X-Next-Page": "3"}),
            f"{_API}/projects/group%2Fp1/merge_requests": json_response([_mr(1)], headers={"X-Next-Page": ""}),
            f"{_API}/projects/group%2Fp2/merge_requests": json_response(
                [_mr(2, "group/p2", updated="2026-02-01T00:00:00Z")], headers={"X-Next-Page": ""}
            ),
            f"{_API}/merge_requests": json_response([_mr(7, "team/svc")], headers={"X-Next-Page": "2"}),
        }
    )


@pytest_asyncio.fixture
async def api(tmp_path: Path, gitlab: RoutedTransport) -> AsyncGenerator[AsyncClient, None]:
    app = FastAPI()
    app.include_router(hosts_router)
    app.include_router(repos_router)
    container = make_container(tmp_path, httpx.MockTransport(gitlab))
    setup_dishka(container, app)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    await container.close()


@pytest_asyncio.fixture
async def host_id(api: AsyncClient) -> str:
    response = await api.post(
        "/api/v1/hosts",
        json={"name": "GL", "type": "gitlab", "base_url": "https://gitlab.example.com", "token": "t"},
    )
    return str(response.json()["id"])


async def test__list_repos__returns_page_envelope(api: AsyncClient, host_id: str, gitlab: RoutedTransport) -> None:
    response = await api.get(f"/api/v1/hosts/{host_id}/repos", params={"page": 2, "per_page": 2, "q": " p "})

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"items", "page", "per_page", "has_more"}
    assert [r["path"] for r in body["items"]] == ["group/p1", "group/p2"]
    assert (body["page"], body["per_page"], body["has_more"]) == (2, 2, True)
    params = gitlab.last_params()
    assert (params["page"], params["per_page"], params["search"]) == ("2", "2", "p")


async def test__list_repos__defaults(api: AsyncClient, host_id: str, gitlab: RoutedTransport) -> None:
    response = await api.get(f"/api/v1/hosts/{host_id}/repos")

    assert (response.json()["page"], response.json()["per_page"]) == (1, 50)
    assert gitlab.last_params()["per_page"] == "50"
    assert "search" not in gitlab.last_params()


async def test__list_mrs__returns_page_envelope_with_null_stats(
    api: AsyncClient, host_id: str, gitlab: RoutedTransport
) -> None:
    response = await api.get(
        f"/api/v1/hosts/{host_id}/repos/group/p1/mrs", params={"state": "merged", "q": "fix", "per_page": 5}
    )

    assert response.status_code == 200
    body = response.json()
    assert (body["page"], body["per_page"], body["has_more"]) == (1, 5, False)
    item = body["items"][0]
    assert (item["iid"], item["additions"], item["deletions"], item["file_count"]) == (1, None, None, None)
    params = gitlab.last_params()
    assert (params["state"], params["search"], params["in"], params["per_page"]) == ("merged", "fix", "title", "5")


async def test__list_mrs__defaults_to_open_mrs_thirty_per_page(
    api: AsyncClient, host_id: str, gitlab: RoutedTransport
) -> None:
    response = await api.get(f"/api/v1/hosts/{host_id}/repos/group/p1/mrs")

    assert response.json()["per_page"] == 30
    assert (gitlab.last_params()["state"], gitlab.last_params()["per_page"]) == ("opened", "30")


async def test__inbox__personal_scope__returns_page_envelope(
    api: AsyncClient, host_id: str, gitlab: RoutedTransport
) -> None:
    response = await api.get(f"/api/v1/hosts/{host_id}/inbox", params={"scope": "authored", "page": 1})

    body = response.json()
    assert response.status_code == 200
    assert [(i["repo_path"], i["iid"]) for i in body["items"]] == [("team/svc", 7)]
    assert (body["page"], body["per_page"], body["has_more"]) == (1, 30, True)
    assert gitlab.last_params()["scope"] == "created_by_me"


async def test__inbox__default_scope_all__merges_repo_batch_newest_first(
    api: AsyncClient, host_id: str, gitlab: RoutedTransport
) -> None:
    response = await api.get(f"/api/v1/hosts/{host_id}/inbox")

    body = response.json()
    assert [(i["repo_path"], i["iid"]) for i in body["items"]] == [("group/p2", 2), ("group/p1", 1)]
    # More repositories remain (X-Next-Page on the project listing).
    assert body["has_more"] is True
    assert f"{_API}/merge_requests" not in gitlab.paths()


@pytest.mark.parametrize(
    ("path", "params"),
    [
        ("repos", {"per_page": 0}),
        ("repos", {"per_page": 101}),
        ("repos", {"page": 0}),
        ("repos/group/p1/mrs", {"per_page": 101}),
        ("repos/group/p1/mrs", {"state": "locked"}),
        ("inbox", {"scope": "everything"}),
        ("inbox", {"per_page": 0}),
        ("inbox", {"page": -1}),
    ],
)
async def test__list_endpoints__invalid_paging_or_filters__return_422(
    api: AsyncClient, host_id: str, gitlab: RoutedTransport, path: str, params: dict[str, Any]
) -> None:
    response = await api.get(f"/api/v1/hosts/{host_id}/{path}", params=params)

    assert response.status_code == 422
    assert gitlab.requests == []


async def test__list_endpoints__per_page_upper_bound_is_accepted(api: AsyncClient, host_id: str) -> None:
    response = await api.get(f"/api/v1/hosts/{host_id}/repos", params={"per_page": 100})

    assert response.status_code == 200


async def test__list_repos__vcs_rejects_token__returns_401(
    api: AsyncClient, host_id: str, gitlab: RoutedTransport
) -> None:
    gitlab.routes[f"{_API}/projects"] = json_response({"message": "401 Unauthorized"}, status_code=401)

    response = await api.get(f"/api/v1/hosts/{host_id}/repos")

    assert response.status_code == 401


@pytest.mark.parametrize(
    ("status_code", "headers"),
    [(429, {}), (403, {"X-RateLimit-Remaining": "0"})],
)
async def test__list_repos__vcs_rate_limited__returns_429(
    api: AsyncClient, host_id: str, gitlab: RoutedTransport, status_code: int, headers: dict[str, str]
) -> None:
    gitlab.routes[f"{_API}/projects"] = json_response({"message": "slow"}, headers=headers, status_code=status_code)

    response = await api.get(f"/api/v1/hosts/{host_id}/repos")

    assert response.status_code == 429


async def test__list_repos__vcs_forbids__returns_403(api: AsyncClient, host_id: str, gitlab: RoutedTransport) -> None:
    gitlab.routes[f"{_API}/projects"] = json_response({"message": "403 Forbidden"}, status_code=403)

    response = await api.get(f"/api/v1/hosts/{host_id}/repos")

    assert response.status_code == 403


async def test__list_repos__vcs_unreachable__returns_502(
    api: AsyncClient, host_id: str, gitlab: RoutedTransport
) -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    gitlab.routes[f"{_API}/projects"] = refuse

    response = await api.get(f"/api/v1/hosts/{host_id}/repos")

    assert response.status_code == 502
    assert "unreachable" in response.json()["detail"]
