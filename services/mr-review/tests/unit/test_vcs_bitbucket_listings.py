"""BitbucketProvider listings: page/pagelen, ``next`` as has_more, BBQL escaping, inbox scopes."""

from __future__ import annotations

from typing import Any

import pytest
from mr_review.core.mrs.entities import PersonalMRScope
from mr_review.infra.vcs.bitbucket import BitbucketProvider

from tests.factories.vcs_http import RoutedTransport, json_response

pytestmark = pytest.mark.unit

_API = "/2.0"
_NEXT = "https://api.bitbucket.org/2.0/whatever?page=3"


def _pr(pr_id: int, repo: str = "team/api", state: str = "OPEN") -> dict[str, Any]:
    return {
        "id": pr_id,
        "title": f"PR {pr_id}",
        "description": "",
        "state": state,
        "author": {"display_name": "Dev"},
        "source": {"branch": {"name": "feature"}},
        "destination": {"branch": {"name": "main"}, "repository": {"full_name": repo}},
        "links": {"html": {"href": f"https://bitbucket.org/{repo}/pull-requests/{pr_id}"}},
        "created_on": "2026-01-01T00:00:00.1234567+00:00",
        "updated_on": "2026-01-02T00:00:00+00:00",
    }


def _provider(transport: RoutedTransport, token: str = "alice:app-pass") -> BitbucketProvider:
    return BitbucketProvider(client=transport.client(), base_url="", token=token)


async def test__list_repos__one_page_with_escaped_name_query() -> None:
    repo = {"uuid": "{r1}", "full_name": "alice/api", "slug": "api", "description": ""}
    transport = RoutedTransport({f"{_API}/repositories/alice": json_response({"values": [repo], "next": _NEXT})})

    page = await _provider(transport).list_repos(query='my "repo"', page=2, per_page=500)

    assert [r.path for r in page.items] == ["alice/api"]
    assert page.has_more is True
    params = transport.last_params()
    assert dict(params) == {"sort": "-updated_on", "pagelen": "100", "q": 'name ~ "my \\"repo\\""', "page": "2"}


async def test__list_repos__bearer_token_without_workspace__empty_page_without_requests() -> None:
    transport = RoutedTransport({})

    page = await _provider(transport, token="oauth-token").list_repos()

    assert (page.items, page.has_more) == ([], False)
    assert transport.requests == []


async def test__list_mrs__all_states_and_clamped_pagelen() -> None:
    transport = RoutedTransport(
        {f"{_API}/repositories/team/api/pullrequests": json_response({"values": [_pr(1, state="MERGED")]})}
    )

    page = await _provider(transport).list_mrs("team/api", state="all", page=2, per_page=100, query="x")

    params = transport.last_params()
    assert params.get_list("state") == ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"]
    assert (params["pagelen"], params["page"], params["sort"], params["q"]) == ("50", "2", "-updated_on", 'title ~ "x"')
    mr = page.items[0]
    assert (mr.status, mr.additions, mr.file_count) == ("merged", None, None)
    assert page.has_more is False


async def test__list_my_mrs__authored__resolves_user_once_and_lists_their_prs() -> None:
    transport = RoutedTransport(
        {
            f"{_API}/user": json_response({"uuid": "{u-1}", "username": "alice"}),
            f"{_API}/pullrequests/%7Bu-1%7D": json_response({"values": [_pr(5, repo="team/web")], "next": _NEXT}),
        }
    )
    provider = _provider(transport)

    page = await provider.list_my_mrs("authored", page=1, per_page=20)
    await provider.list_my_mrs("authored", page=2, per_page=20)

    assert transport.paths().count(f"{_API}/user") == 1
    assert page.items[0].repo_path == "team/web"
    assert page.has_more is True
    assert transport.last_params()["state"] == "OPEN"


@pytest.mark.parametrize("scope", ["assigned", "review_requested"])
async def test__list_my_mrs__unsupported_scopes__empty_page_without_requests(scope: PersonalMRScope) -> None:
    transport = RoutedTransport({})

    page = await _provider(transport).list_my_mrs(scope)

    assert (page.items, page.has_more) == ([], False)
    assert transport.requests == []
