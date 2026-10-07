"""GitHubProvider listings: one upstream request per page, Link-based has_more, state mapping, inbox scopes."""

from __future__ import annotations

from typing import Any

import pytest
from mr_review.core.mrs.entities import MRStateFilter, PersonalMRScope
from mr_review.infra.vcs.github import GitHubProvider

from tests.factories.vcs_http import RoutedTransport, json_response

pytestmark = pytest.mark.unit

_NEXT_LINK = {"Link": '<https://api.github.com/x?page=3>; rel="next", <https://api.github.com/x?page=9>; rel="last"'}
_LAST_LINK = {"Link": '<https://api.github.com/x?page=1>; rel="first", <https://api.github.com/x?page=1>; rel="prev"'}


def _pull(number: int, *, state: str = "open", merged_at: str | None = None) -> dict[str, Any]:
    return {
        "number": number,
        "title": f"PR {number}",
        "body": None,
        "user": {"login": "dev"},
        "head": {"ref": "feature"},
        "base": {"ref": "main"},
        "state": state,
        "merged_at": merged_at,
        "draft": False,
        "html_url": f"https://github.com/acme/api/pull/{number}",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-02T00:00:00Z",
    }


def _hit(number: int, *, repo: str = "acme/api", state: str = "open", merged_at: str | None = None) -> dict[str, Any]:
    return {
        "number": number,
        "title": f"Hit {number}",
        "body": "text",
        "user": {"login": "dev"},
        "state": state,
        "draft": True,
        "html_url": f"https://github.com/{repo}/pull/{number}",
        "repository_url": f"https://api.github.com/repos/{repo}",
        "pull_request": {"merged_at": merged_at},
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-03T00:00:00Z",
    }


def _repo(i: int) -> dict[str, Any]:
    return {"id": i, "full_name": f"acme/r{i}", "name": f"r{i}", "description": None}


def _provider(transport: RoutedTransport) -> GitHubProvider:
    return GitHubProvider(client=transport.client(), base_url="https://github.com", token="t")


async def test__list_repos__requests_one_page_sorted_by_update_and_reads_next_link() -> None:
    transport = RoutedTransport({"/user/repos": json_response([_repo(1), _repo(2)], headers=_NEXT_LINK)})

    page = await _provider(transport).list_repos(page=2, per_page=2)

    assert [r.path for r in page.items] == ["acme/r1", "acme/r2"]
    assert (page.page, page.per_page, page.has_more) == (2, 2, True)
    assert len(transport.requests) == 1
    params = transport.last_params()
    assert (params["page"], params["per_page"], params["sort"], params["direction"]) == ("2", "2", "updated", "desc")


async def test__list_repos__without_next_link__has_more_false_even_for_a_full_page() -> None:
    transport = RoutedTransport({"/user/repos": json_response([_repo(1), _repo(2)], headers=_LAST_LINK)})

    page = await _provider(transport).list_repos(per_page=2)

    assert page.has_more is False


async def test__list_repos__with_query__uses_repository_search() -> None:
    transport = RoutedTransport({"/search/repositories": json_response({"total_count": 1, "items": [_repo(7)]})})

    page = await _provider(transport).list_repos(query="r7", page=1, per_page=10)

    assert [r.path for r in page.items] == ["acme/r7"]
    assert page.has_more is False
    assert transport.last_params()["q"] == "r7"


async def test__list_mrs__opened__uses_pulls_api_with_open_state_and_null_stats() -> None:
    transport = RoutedTransport({"/repos/acme/api/pulls": json_response([_pull(1)], headers=_NEXT_LINK)})

    page = await _provider(transport).list_mrs("acme/api", state="opened", page=3, per_page=1)

    params = transport.last_params()
    assert (params["state"], params["sort"], params["direction"], params["page"]) == ("open", "updated", "desc", "3")
    mr = page.items[0]
    assert (mr.status, mr.source_branch, mr.target_branch) == ("opened", "feature", "main")
    assert (mr.additions, mr.deletions, mr.file_count) == (None, None, None)
    assert page.has_more is True


async def test__list_mrs__all__passes_all_state_to_pulls_api() -> None:
    transport = RoutedTransport({"/repos/acme/api/pulls": json_response([_pull(1, state="closed", merged_at="x")])})

    page = await _provider(transport).list_mrs("acme/api", state="all")

    assert transport.last_params()["state"] == "all"
    assert page.items[0].status == "merged"


@pytest.mark.parametrize(
    ("state", "qualifiers"),
    [("merged", "is:merged"), ("closed", "is:closed is:unmerged")],
)
async def test__list_mrs__merged_or_closed__uses_issue_search_never_a_bogus_pulls_state(
    state: MRStateFilter, qualifiers: str
) -> None:
    merged_at = "2026-01-02T00:00:00Z" if state == "merged" else None
    transport = RoutedTransport(
        {"/search/issues": json_response({"items": [_hit(4, state="closed", merged_at=merged_at)]}, headers=_NEXT_LINK)}
    )

    page = await _provider(transport).list_mrs("acme/api", state=state, page=2, per_page=1)

    assert transport.paths() == ["/search/issues"]
    params = transport.last_params()
    assert params["q"] == f"repo:acme/api is:pr {qualifiers}"
    assert (params["sort"], params["order"], params["page"], params["per_page"]) == ("updated", "desc", "2", "1")
    assert page.items[0].status == state
    assert page.has_more is True


async def test__list_mrs__with_query__searches_titles_host_side() -> None:
    transport = RoutedTransport({"/search/issues": json_response({"items": [_hit(9)]})})

    page = await _provider(transport).list_mrs("acme/api", state="opened", query='fix "login"')

    assert transport.last_params()["q"] == "repo:acme/api is:pr is:open fix login in:title"
    mr = page.items[0]
    assert (mr.source_branch, mr.target_branch, mr.additions, mr.draft) == ("", "", None, True)
    assert page.has_more is False


@pytest.mark.parametrize(
    ("scope", "qualifier"),
    [("authored", "author:@me"), ("assigned", "assignee:@me"), ("review_requested", "review-requested:@me")],
)
async def test__list_my_mrs__scope__maps_to_search_qualifier(scope: PersonalMRScope, qualifier: str) -> None:
    transport = RoutedTransport({"/search/issues": json_response({"items": [_hit(1, repo="org/svc")]})})

    page = await _provider(transport).list_my_mrs(scope, page=1, per_page=30)

    assert transport.last_params()["q"] == f"is:pr is:open archived:false {qualifier}"
    assert page.items[0].repo_path == "org/svc"
    assert page.items[0].mr.iid == 1


async def test__get_mr__detail__fills_stats_from_the_host() -> None:
    detail = {**_pull(2), "additions": 10, "deletions": 3, "changed_files": 2}
    transport = RoutedTransport({"/repos/acme/api/pulls/2": json_response(detail)})

    mr = await _provider(transport).get_mr("acme/api", 2)

    assert (mr.additions, mr.deletions, mr.file_count) == (10, 3, 2)
