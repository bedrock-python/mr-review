"""GitLabProvider: paginated listings (X-Next-Page), per-user inbox scopes, nullable list stats."""

from __future__ import annotations

from typing import Any

import pytest
from mr_review.core.mrs.entities import MRStateFilter, PersonalMRScope
from mr_review.infra.vcs.gitlab import GitLabProvider

from tests.factories.vcs_http import RoutedTransport, json_response

pytestmark = pytest.mark.unit

_API = "/api/v4"
_PROJECT = "/api/v4/projects/group%2Fsub%2Fproj"


def _mr(iid: int, *, state: str = "opened", project: str = "group/sub/proj", **extra: Any) -> dict[str, Any]:
    return {
        "iid": iid,
        "title": f"MR {iid}",
        "description": None,
        "author": {"username": "dev"},
        "source_branch": "feature",
        "target_branch": "main",
        "state": state,
        "draft": False,
        "web_url": f"https://gitlab.example.com/{project}/-/merge_requests/{iid}",
        "references": {"full": f"{project}!{iid}"},
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-02T00:00:00Z",
        **extra,
    }


def _project(i: int) -> dict[str, Any]:
    return {"id": i, "path_with_namespace": f"group/p{i}", "name": f"p{i}", "description": "d"}


def _provider(transport: RoutedTransport) -> GitLabProvider:
    return GitLabProvider(client=transport.client(), base_url="https://gitlab.example.com", token="t")


async def test__list_repos__one_request_with_page_params_and_next_page_header() -> None:
    transport = RoutedTransport(
        {f"{_API}/projects": json_response([_project(1), _project(2)], headers={"X-Next-Page": "3"})}
    )

    page = await _provider(transport).list_repos(query="p", page=2, per_page=2)

    assert [r.path for r in page.items] == ["group/p1", "group/p2"]
    assert (page.page, page.per_page, page.has_more) == (2, 2, True)
    params = transport.last_params()
    assert dict(params) == {
        "membership": "true",
        "simple": "true",
        "order_by": "last_activity_at",
        "sort": "desc",
        "per_page": "2",
        "page": "2",
        "search": "p",
    }


async def test__list_repos__empty_next_page_header__no_more_pages_even_when_full() -> None:
    transport = RoutedTransport({f"{_API}/projects": json_response([_project(1)], headers={"X-Next-Page": ""})})

    page = await _provider(transport).list_repos(per_page=1)

    assert page.has_more is False


async def test__list_repos__no_pagination_headers__falls_back_to_full_page() -> None:
    transport = RoutedTransport({f"{_API}/projects": json_response([_project(1), _project(2)])})

    assert (await _provider(transport).list_repos(per_page=2)).has_more is True
    assert (await _provider(transport).list_repos(per_page=3)).has_more is False


@pytest.mark.parametrize("state", ["opened", "merged", "closed", "all"])
async def test__list_mrs__state_and_ordering_passed_through(state: MRStateFilter) -> None:
    transport = RoutedTransport(
        {f"{_PROJECT}/merge_requests": json_response([_mr(1, state="merged")], headers={"X-Next-Page": ""})}
    )

    page = await _provider(transport).list_mrs("group/sub/proj", state=state, page=4, per_page=10)

    params = transport.last_params()
    assert (params["state"], params["order_by"], params["sort"]) == (state, "updated_at", "desc")
    assert (params["page"], params["per_page"]) == ("4", "10")
    assert "search" not in params
    mr = page.items[0]
    assert (mr.additions, mr.deletions, mr.file_count, mr.pipeline) == (None, None, None, None)
    assert page.has_more is False


async def test__list_mrs__with_query__searches_titles_host_side() -> None:
    transport = RoutedTransport({f"{_PROJECT}/merge_requests": json_response([])})

    await _provider(transport).list_mrs("group/sub/proj", query="login")

    params = transport.last_params()
    assert (params["search"], params["in"]) == ("login", "title")


@pytest.mark.parametrize(("scope", "gitlab_scope"), [("authored", "created_by_me"), ("assigned", "assigned_to_me")])
async def test__list_my_mrs__personal_scopes__use_instance_wide_listing(
    scope: PersonalMRScope, gitlab_scope: str
) -> None:
    transport = RoutedTransport(
        {f"{_API}/merge_requests": json_response([_mr(7, project="team/svc")], headers={"X-Next-Page": "2"})}
    )

    page = await _provider(transport).list_my_mrs(scope, page=1, per_page=20)

    params = transport.last_params()
    assert (params["scope"], params["state"], params["order_by"]) == (gitlab_scope, "opened", "updated_at")
    assert page.items[0].repo_path == "team/svc"
    assert page.has_more is True


async def test__list_my_mrs__review_requested__resolves_user_once() -> None:
    transport = RoutedTransport(
        {
            f"{_API}/user": json_response({"username": "alice"}),
            f"{_API}/merge_requests": json_response([_mr(1)]),
        }
    )
    provider = _provider(transport)

    await provider.list_my_mrs("review_requested")
    await provider.list_my_mrs("review_requested", page=2)

    assert transport.paths().count(f"{_API}/user") == 1
    params = transport.last_params()
    assert (params["scope"], params["reviewer_username"], params["page"]) == ("all", "alice", "2")


async def test__list_my_mrs__repo_path_falls_back_to_web_url() -> None:
    item = _mr(3, project="a/b")
    del item["references"]
    transport = RoutedTransport({f"{_API}/merge_requests": json_response([item])})

    page = await _provider(transport).list_my_mrs("authored")

    assert page.items[0].repo_path == "a/b"


async def test__get_mr__detail__reads_changes_count_and_pipeline() -> None:
    detail = _mr(5, changes_count="1000+", head_pipeline={"status": "success"})
    transport = RoutedTransport({f"{_PROJECT}/merge_requests/5": json_response(detail)})

    mr = await _provider(transport).get_mr("group/sub/proj", 5)

    assert (mr.file_count, mr.additions, mr.pipeline) == (1000, None, "passed")
