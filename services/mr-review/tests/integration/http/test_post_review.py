"""POST /reviews/{id}/post through the full stack against a mock GitLab.

Posting twice must not put the comments on the MR twice, and what was posted has to be readable
from the review afterwards (the UI shows it after a reload).
"""

from __future__ import annotations

import asyncio
import json
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
from mr_review.api.routers.v1.reviews import router as reviews_router

from tests.factories.vcs_container import make_container
from tests.factories.vcs_http import RoutedTransport, json_response

pytestmark = [pytest.mark.integration, pytest.mark.http]

_MR = "/api/v4/projects/group%2Frepo/merge_requests/7"
# src/a.py: line 1 unchanged, 2 added, 3 and 4 unchanged (old lines 2 and 3).
_DIFF = "@@ -1,3 +1,4 @@\n a\n+b\n c\n d\n"


@pytest.fixture
def gitlab() -> RoutedTransport:
    note_ids = iter(range(500, 600))
    return RoutedTransport(
        {
            _MR: json_response({"diff_refs": {"base_sha": "b", "start_sha": "s", "head_sha": "h"}}),
            f"{_MR}/diffs": json_response(
                [{"old_path": "src/a.py", "new_path": "src/a.py", "diff": _DIFF}], headers={"X-Next-Page": ""}
            ),
            f"{_MR}/discussions": lambda _r: json_response({"id": "d", "notes": [{"id": next(note_ids)}]}),
            f"{_MR}/notes": lambda _r: json_response({"id": next(note_ids)}),
        }
    )


@pytest_asyncio.fixture
async def api(tmp_path: Path, gitlab: RoutedTransport) -> AsyncGenerator[AsyncClient, None]:
    app = FastAPI()
    app.include_router(hosts_router)
    app.include_router(reviews_router)
    container = make_container(tmp_path, httpx.MockTransport(gitlab))
    setup_dishka(container, app)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    await container.close()


async def _review_with_comments(api: AsyncClient, comments: list[dict[str, Any]]) -> tuple[str, str]:
    host = await api.post(
        "/api/v1/hosts",
        json={"name": "GL", "type": "gitlab", "base_url": "https://gitlab.example.com", "token": "t"},
    )
    review = await api.post(
        "/api/v1/reviews", json={"host_id": host.json()["id"], "repo_path": "group/repo", "mr_iid": 7}
    )
    review_id = str(review.json()["id"])
    created = await api.post(f"/api/v1/reviews/{review_id}/iterations", json={})
    iteration_id = str(created.json()["iterations"][-1]["id"])
    for comment in comments:
        response = await api.post(f"/api/v1/reviews/{review_id}/iterations/{iteration_id}/comments", json=comment)
        assert response.status_code == 201
    return review_id, iteration_id


async def test__post__twice__second_post_is_refused_and_nothing_is_sent_again(
    api: AsyncClient, gitlab: RoutedTransport
) -> None:
    review_id, iteration_id = await _review_with_comments(
        api,
        [
            {"file": "src/a.py", "line": 3, "severity": "major", "body": "On an unchanged line"},
            {"file": None, "line": None, "severity": "minor", "body": "Overall"},
        ],
    )

    first = await api.post(f"/api/v1/reviews/{review_id}/post", json={"iteration_id": iteration_id})
    sent = len(gitlab.requests)
    second = await api.post(f"/api/v1/reviews/{review_id}/post", json={"iteration_id": iteration_id})

    assert first.status_code == 200
    body = first.json()
    assert (body["posted"], body["failed"], body["skipped"], body["completed"]) == (2, 0, 0, True)
    assert [r["post"]["outcome"] for r in body["results"]] == ["inline", "general_note"]
    assert second.status_code == 409
    assert "already posted" in second.json()["detail"]
    assert len(gitlab.requests) == sent


async def test__post__unchanged_line__is_anchored_inline_by_both_sides(
    api: AsyncClient, gitlab: RoutedTransport
) -> None:
    review_id, _ = await _review_with_comments(
        api, [{"file": "src/a.py", "line": 3, "severity": "major", "body": "Context"}]
    )

    response = await api.post(f"/api/v1/reviews/{review_id}/post", json={})

    discussion = next(r for r in gitlab.requests if r.url.path.endswith("/discussions"))
    payload = json.loads(discussion.content)
    assert (payload["position"]["old_line"], payload["position"]["new_line"]) == (2, 3)
    assert payload["body"] == "**Major** · Context"
    assert not any(r.url.path.endswith("/notes") for r in gitlab.requests)
    assert response.json()["results"][0]["post"]["outcome"] == "inline"


async def test__post__records_survive_a_reload(api: AsyncClient) -> None:
    review_id, _ = await _review_with_comments(
        api, [{"file": "src/a.py", "line": 2, "severity": "minor", "body": "Added"}]
    )

    await api.post(f"/api/v1/reviews/{review_id}/post", json={})
    reloaded = (await api.get(f"/api/v1/reviews/{review_id}")).json()

    iteration = reloaded["iterations"][-1]
    assert iteration["stage"] == "post"
    assert iteration["completed_at"] is not None
    post = iteration["comments"][0]["post"]
    assert (post["outcome"], post["note_id"]) == ("inline", "500")
    assert post["url"] == "https://gitlab.example.com/group/repo/-/merge_requests/7#note_500"


async def test__post__second_request_while_the_first_runs__is_refused(
    api: AsyncClient, gitlab: RoutedTransport
) -> None:
    """The click that used to follow a client timeout must not post the comments a second time."""
    review_id, _ = await _review_with_comments(
        api, [{"file": "src/a.py", "line": 2, "severity": "minor", "body": "Added"}]
    )
    entered = asyncio.Event()
    release = asyncio.Event()

    async def slow_discussion(_request: httpx.Request) -> httpx.Response:
        entered.set()
        await release.wait()
        return json_response({"id": "d", "notes": [{"id": 1}]})

    gitlab.routes[f"{_MR}/discussions"] = slow_discussion
    first = asyncio.create_task(api.post(f"/api/v1/reviews/{review_id}/post", json={}))
    await entered.wait()
    second = await api.post(f"/api/v1/reviews/{review_id}/post", json={})
    release.set()

    assert second.status_code == 409
    assert "being posted right now" in second.json()["detail"]
    assert (await first).status_code == 200
    assert sum(1 for r in gitlab.requests if r.url.path.endswith("/discussions")) == 1


async def test__comment_changes_while_the_review_is_posted__answer_409(
    api: AsyncClient, gitlab: RoutedTransport
) -> None:
    """A PATCH that read the review before the post's last write would put back comments without records."""
    review_id, iteration_id = await _review_with_comments(
        api, [{"file": "src/a.py", "line": 2, "severity": "minor", "body": "Added"}]
    )
    comment_id = (await api.get(f"/api/v1/reviews/{review_id}")).json()["iterations"][-1]["comments"][0]["id"]
    entered = asyncio.Event()
    release = asyncio.Event()

    async def slow_discussion(_request: httpx.Request) -> httpx.Response:
        entered.set()
        await release.wait()
        return json_response({"id": "d", "notes": [{"id": 1}]})

    gitlab.routes[f"{_MR}/discussions"] = slow_discussion
    post = asyncio.create_task(api.post(f"/api/v1/reviews/{review_id}/post", json={}))
    await entered.wait()
    patch = await api.patch(
        f"/api/v1/reviews/{review_id}",
        json={"iteration_id": iteration_id, "iteration_comments": [{"id": comment_id, "body": "Changed"}]},
    )
    add = await api.post(
        f"/api/v1/reviews/{review_id}/iterations/{iteration_id}/comments",
        json={"file": None, "line": None, "severity": "minor", "body": "New"},
    )
    release.set()
    await post

    assert (patch.status_code, add.status_code) == (409, 409)
    comments = (await api.get(f"/api/v1/reviews/{review_id}")).json()["iterations"][-1]["comments"]
    assert [(c["body"], c["post"]["outcome"]) for c in comments] == [("Added", "inline")]


async def test__post__force__posts_a_completed_iteration_again(api: AsyncClient, gitlab: RoutedTransport) -> None:
    review_id, _ = await _review_with_comments(
        api, [{"file": None, "line": None, "severity": "minor", "body": "Overall"}]
    )
    await api.post(f"/api/v1/reviews/{review_id}/post", json={})

    again = await api.post(f"/api/v1/reviews/{review_id}/post", json={"force": True, "severity_label": "off"})

    assert again.status_code == 200
    notes = [json.loads(r.content)["body"] for r in gitlab.requests if r.url.path.endswith("/notes")]
    assert notes == ["**Minor** · Overall", "Overall"]
