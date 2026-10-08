"""GiteaProvider listings: one upstream request per page, X-HasMore/Link signals, merged/closed split, inbox scopes."""

from __future__ import annotations

from typing import Any

import pytest
from mr_review.core.mrs.entities import PersonalMRScope
from mr_review.infra.vcs.gitea import GiteaProvider

from tests.factories.vcs_http import RoutedTransport, json_response

pytestmark = pytest.mark.unit

_API = "/api/v1"


def _pull(number: int, *, state: str = "open", merged: bool = False, title: str | None = None) -> dict[str, Any]:
    return {
        "number": number,
        "title": title or f"PR {number}",
        "body": "",
        "user": {"login": "dev"},
        "head": {"label": "feature", "ref": "feature"},
        "base": {"label": "main", "ref": "main"},
        "state": state,
        "merged": merged,
        "draft": False,
        "html_url": f"https://gitea.example.com/acme/api/pulls/{number}",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-02T00:00:00Z",
    }


def _issue(number: int, repo: str) -> dict[str, Any]:
    return {
        "number": number,
        "title": f"Issue {number}",
        "body": None,
        "user": {"login": "dev"},
        "state": "open",
        "html_url": f"https://gitea.example.com/{repo}/issues/{number}",
        "pull_request": {
            "merged": False,
            "draft": True,
            "html_url": f"https://gitea.example.com/{repo}/pulls/{number}",
        },
        "repository": {"full_name": repo},
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-02T00:00:00Z",
    }


def _provider(transport: RoutedTransport) -> GiteaProvider:
    return GiteaProvider(client=transport.client(), base_url="https://gitea.example.com", token="t")


async def test__list_repos__sorted_by_update_and_reads_link_header() -> None:
    repos = [{"id": 1, "full_name": "acme/api", "name": "api", "description": ""}]
    transport = RoutedTransport(
        {
            f"{_API}/user": json_response({"id": 42, "login": "alice"}),
            f"{_API}/repos/search": json_response(
                {"ok": True, "data": repos},
                headers={"Link": '<https://gitea.example.com/api/v1/repos/search?page=3>; rel="next"'},
            ),
        }
    )

    page = await _provider(transport).list_repos(query="api", page=2, per_page=1)

    assert [r.path for r in page.items] == ["acme/api"]
    assert page.has_more is True
    params = transport.last_params()
    assert dict(params) == {"uid": "42", "sort": "updated", "order": "desc", "limit": "1", "page": "2", "q": "api"}


async def test__list_repos__only_the_users_own_and_contributed_repos__user_resolved_once() -> None:
    """Without uid, /repos/search lists every repository visible on the instance (all of Codeberg)."""
    transport = RoutedTransport(
        {
            f"{_API}/user": json_response({"id": 7, "login": "bob"}),
            f"{_API}/repos/search": json_response({"ok": True, "data": []}),
        }
    )
    provider = _provider(transport)

    await provider.list_repos()
    await provider.list_repos(page=2)

    searches = [r for r in transport.requests if r.url.path.endswith("/repos/search")]
    assert [r.url.params["uid"] for r in searches] == ["7", "7"]
    assert all("exclusive" not in r.url.params for r in searches)
    assert transport.paths().count(f"{_API}/user") == 1


async def test__list_repos__x_hasmore_header__wins() -> None:
    transport = RoutedTransport(
        {
            f"{_API}/user": json_response({"id": 1}),
            f"{_API}/repos/search": json_response({"data": []}, headers={"X-HasMore": "true"}),
        }
    )

    page = await _provider(transport).list_repos()

    assert page.has_more is True


async def test__list_mrs__opened__one_request_sorted_by_recent_update() -> None:
    transport = RoutedTransport({f"{_API}/repos/acme/api/pulls": json_response([_pull(1)])})

    page = await _provider(transport).list_mrs("acme/api", page=3, per_page=1)

    params = transport.last_params()
    assert dict(params) == {"state": "open", "sort": "recentupdate", "limit": "1", "page": "3"}
    assert (page.items[0].additions, page.items[0].file_count) == (None, None)
    # No Link / X-HasMore: a full page means there may be more.
    assert page.has_more is True


async def test__list_mrs__merged__keeps_only_merged_items_but_has_more_follows_upstream() -> None:
    body = [_pull(1, state="closed", merged=True), _pull(2, state="closed")]
    transport = RoutedTransport({f"{_API}/repos/acme/api/pulls": json_response(body)})

    page = await _provider(transport).list_mrs("acme/api", state="merged", per_page=2)

    assert transport.last_params()["state"] == "closed"
    assert [mr.iid for mr in page.items] == [1]
    assert page.has_more is True


async def test__list_mrs__closed__excludes_merged_items() -> None:
    body = [_pull(1, state="closed", merged=True), _pull(2, state="closed")]
    transport = RoutedTransport({f"{_API}/repos/acme/api/pulls": json_response(body)})

    page = await _provider(transport).list_mrs("acme/api", state="closed", per_page=5)

    assert [mr.iid for mr in page.items] == [2]
    assert page.has_more is False


async def test__list_mrs__query__filters_titles_on_the_fetched_page() -> None:
    body = [_pull(1, title="Fix login"), _pull(2, title="Bump deps")]
    transport = RoutedTransport({f"{_API}/repos/acme/api/pulls": json_response(body)})

    page = await _provider(transport).list_mrs("acme/api", query="LOGIN")

    assert [mr.iid for mr in page.items] == [1]


@pytest.mark.parametrize(
    ("scope", "flag"), [("authored", "created"), ("assigned", "assigned"), ("review_requested", "review_requested")]
)
async def test__list_my_mrs__scope__maps_to_issue_search_flag(scope: PersonalMRScope, flag: str) -> None:
    transport = RoutedTransport({f"{_API}/repos/issues/search": json_response([_issue(4, "org/svc")])})

    page = await _provider(transport).list_my_mrs(scope, page=2, per_page=10)

    params = transport.last_params()
    assert (params["type"], params["state"], params[flag], params["page"], params["limit"]) == (
        "pulls",
        "open",
        "true",
        "2",
        "10",
    )
    item = page.items[0]
    assert (item.repo_path, item.mr.iid, item.mr.draft, item.mr.source_branch) == ("org/svc", 4, True, "")
    assert item.mr.web_url.endswith("/pulls/4")
