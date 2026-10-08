"""BitbucketProvider.get_commits must not walk a file's whole history."""

from __future__ import annotations

import pytest
from mr_review.infra.vcs.bitbucket import BitbucketProvider

from tests.factories.vcs_http import RoutedTransport, json_response

pytestmark = pytest.mark.unit


async def test__get_commits__reads_only_the_first_page() -> None:
    commit = {"hash": "abcdef123456", "message": "msg\nbody", "author": {"raw": "Dev <d@x>"}, "date": "2026-01-01"}
    transport = RoutedTransport(
        {
            "/2.0/repositories/team/api/commits/main": json_response(
                {"values": [commit], "next": "https://api.bitbucket.org/2.0/repositories/team/api/commits/main?page=2"}
            )
        }
    )
    provider = BitbucketProvider(client=transport.client(), base_url="", token="alice:app-pass")

    commits = await provider.get_commits("team/api", "src/a.py", ref="main", limit=1)

    assert commits == [{"id": "abcdef12", "title": "msg", "author": "Dev", "date": "2026-01-01"}]
    assert len(transport.requests) == 1
