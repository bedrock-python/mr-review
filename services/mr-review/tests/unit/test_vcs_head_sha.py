"""Every provider's single-MR view exposes the head commit SHA (internal, for reading context files)."""

from __future__ import annotations

from typing import Any

import pytest
from mr_review.infra.vcs.bitbucket import BitbucketProvider
from mr_review.infra.vcs.gitea import GiteaProvider
from mr_review.infra.vcs.github import GitHubProvider
from mr_review.infra.vcs.gitlab import GitLabProvider

from tests.factories.vcs_http import RoutedTransport, json_response

pytestmark = pytest.mark.unit

_TIMES = {"created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-02T00:00:00Z"}


def _pull(head: dict[str, Any]) -> dict[str, Any]:
    return {
        "number": 3,
        "title": "t",
        "body": "",
        "user": {"login": "dev"},
        "head": head,
        "base": {"ref": "main", "label": "main"},
        "state": "open",
        **_TIMES,
    }


async def test__github_get_mr__head_sha_from_head() -> None:
    transport = RoutedTransport({"/repos/acme/api/pulls/3": json_response(_pull({"ref": "feature", "sha": "gh-sha"}))})

    mr = await GitHubProvider(client=transport.client(), base_url="", token="t").get_mr("acme/api", 3)

    assert (mr.head_sha, mr.source_branch) == ("gh-sha", "feature")


async def test__gitea_get_mr__head_sha_from_head() -> None:
    head = {"label": "feature", "ref": "feature", "sha": "gt-sha"}
    transport = RoutedTransport({"/api/v1/repos/acme/api/pulls/3": json_response(_pull(head))})
    provider = GiteaProvider(client=transport.client(), base_url="https://gitea.example.com", token="t")

    mr = await provider.get_mr("acme/api", 3)

    assert (mr.head_sha, mr.source_branch) == ("gt-sha", "feature")


@pytest.mark.parametrize(
    ("extra", "expected"),
    [
        ({"sha": "gl-sha", "diff_refs": {"head_sha": "other"}}, "gl-sha"),
        ({"diff_refs": {"head_sha": "from-refs"}}, "from-refs"),
        ({}, None),
    ],
)
async def test__gitlab_get_mr__head_sha_from_sha_or_diff_refs(extra: dict[str, Any], expected: str | None) -> None:
    detail = {
        "iid": 3,
        "title": "t",
        "author": {"username": "dev"},
        "source_branch": "feature",
        "target_branch": "main",
        "state": "merged",
        **_TIMES,
        **extra,
    }
    transport = RoutedTransport({"/api/v4/projects/g%2Fp/merge_requests/3": json_response(detail)})
    provider = GitLabProvider(client=transport.client(), base_url="https://gl.example.com", token="t")

    mr = await provider.get_mr("g/p", 3)

    assert mr.head_sha == expected


async def test__bitbucket_get_mr__head_sha_from_source_commit() -> None:
    pr = {
        "id": 3,
        "title": "t",
        "state": "OPEN",
        "author": {"display_name": "Dev"},
        "source": {"branch": {"name": "feature"}, "commit": {"hash": "bb12abcdef34"}},
        "destination": {"branch": {"name": "main"}},
        "created_on": "2026-01-01T00:00:00+00:00",
        "updated_on": "2026-01-02T00:00:00+00:00",
    }
    diffstat = {"values": [{"lines_added": 2, "lines_removed": 1}]}
    transport = RoutedTransport(
        {
            "/2.0/repositories/team/api/pullrequests/3": json_response(pr),
            "/2.0/repositories/team/api/pullrequests/3/diffstat": json_response(diffstat),
        }
    )

    mr = await BitbucketProvider(client=transport.client(), base_url="", token="u:p").get_mr("team/api", 3)

    assert (mr.head_sha, mr.additions, mr.deletions, mr.file_count) == ("bb12abcdef34", 2, 1, 1)
