"""Directory listings on GitHub/Gitea fetch the recursive tree once per (repo, ref) and filter in memory."""

from __future__ import annotations

import asyncio

import httpx
import pytest
from mr_review.infra.vcs._tree import WholeTreeListing
from mr_review.infra.vcs.bitbucket import BitbucketProvider
from mr_review.infra.vcs.cache import CachedVCSProvider
from mr_review.infra.vcs.gitea import GITEA_MAX_TREE_PAGES, GiteaProvider
from mr_review.infra.vcs.github import GitHubProvider
from mr_review.infra.vcs.gitlab import GitLabProvider

from tests.factories.vcs_http import RoutedTransport, json_response

pytestmark = pytest.mark.unit

_TREE = {
    "tree": [
        {"path": "src", "type": "tree"},
        {"path": "src/a.py", "type": "blob"},
        {"path": "src/pkg/b.py", "type": "blob"},
        {"path": "srcx/c.py", "type": "blob"},
        {"path": "tests/test_a.py", "type": "blob"},
    ],
    "truncated": False,
}


def _github(transport: RoutedTransport) -> CachedVCSProvider:
    return CachedVCSProvider(GitHubProvider(client=transport.client(), base_url="", token="t"))


async def test__github__directories_at_one_ref__share_one_tree_request() -> None:
    transport = RoutedTransport(
        {
            "/repos/acme/api/git/trees/sha1": json_response(_TREE),
            "/repos/acme/api/git/trees/sha2": json_response(_TREE),
        }
    )
    provider = _github(transport)

    src = await provider.list_directory("acme/api", "src", "sha1")
    tests = await provider.list_directory("acme/api", "tests/", "sha1")
    other_ref = await provider.list_directory("acme/api", "src", "sha2")

    assert src == ["src/a.py", "src/pkg/b.py"]
    assert tests == ["tests/test_a.py"]
    assert other_ref == src
    assert transport.paths() == ["/repos/acme/api/git/trees/sha1", "/repos/acme/api/git/trees/sha2"]
    assert transport.requests[0].url.params["recursive"] == "1"


async def test__github__concurrent_listings__one_tree_request() -> None:
    transport = RoutedTransport({"/repos/acme/api/git/trees/main": json_response(_TREE)})
    provider = _github(transport)

    results = await asyncio.gather(*[provider.list_directory("acme/api", d, "main") for d in ("src", "tests", "docs")])

    assert results == [["src/a.py", "src/pkg/b.py"], ["tests/test_a.py"], []]
    assert len(transport.requests) == 1


async def test__github__missing_ref__empty_listing() -> None:
    transport = RoutedTransport(
        {"/repos/acme/api/git/trees/gone": json_response({"message": "Not Found"}, status_code=404)}
    )

    assert await _github(transport).list_directory("acme/api", "src", "gone") == []


async def test__gitea__directories_at_one_ref__share_one_tree_request() -> None:
    transport = RoutedTransport({"/api/v1/repos/acme/api/git/trees/main": json_response(_TREE)})
    provider = CachedVCSProvider(
        GiteaProvider(client=transport.client(), base_url="https://gitea.example.com", token="t")
    )

    assert await provider.list_directory("acme/api", "src", "main") == ["src/a.py", "src/pkg/b.py"]
    assert await provider.list_directory("acme/api", "tests", "main") == ["tests/test_a.py"]
    assert len(transport.requests) == 1


async def test__per_directory_hosts__keep_their_own_listing() -> None:
    async with httpx.AsyncClient() as client:
        assert isinstance(GitHubProvider(client=client, base_url="", token="t"), WholeTreeListing)
        assert not isinstance(GitLabProvider(client=client, base_url="https://gl", token="t"), WholeTreeListing)
        assert not isinstance(BitbucketProvider(client=client, base_url="", token="u:p"), WholeTreeListing)


async def test__github__repo_invalidation__drops_the_cached_tree() -> None:
    transport = RoutedTransport({"/repos/acme/api/git/trees/main": json_response(_TREE)})
    provider = _github(transport)

    await provider.list_directory("acme/api", "src", "main")
    provider.invalidate("other/repo")
    await provider.list_directory("acme/api", "src", "main")
    provider.invalidate("acme/api")
    await provider.list_directory("acme/api", "src", "main")

    assert len(transport.requests) == 2


async def test__gitea__tree_spanning_several_pages__is_read_to_the_end() -> None:
    """Gitea pages git trees (1000 entries by default) and flags more with ``truncated``."""

    def tree(request: httpx.Request) -> httpx.Response:
        page = int(request.url.params["page"])
        entries = [{"path": f"src/p{page}_{i}.py", "type": "blob"} for i in range(2)]
        return json_response({"tree": entries, "truncated": page < 3, "page": page})

    transport = RoutedTransport({"/api/v1/repos/acme/api/git/trees/main": tree})
    provider = GiteaProvider(client=transport.client(), base_url="https://gitea.example.com", token="t")

    paths = await provider.list_tree("acme/api", "main")

    assert paths == [f"src/p{page}_{i}.py" for page in (1, 2, 3) for i in range(2)]
    assert [r.url.params["page"] for r in transport.requests] == ["1", "2", "3"]
    assert all(r.url.params["recursive"] == "true" for r in transport.requests)


async def test__gitea__endless_tree__stops_at_the_page_cap() -> None:
    transport = RoutedTransport(
        {
            "/api/v1/repos/acme/api/git/trees/main": json_response(
                {"tree": [{"path": "a", "type": "blob"}], "truncated": True}
            )
        }
    )
    provider = GiteaProvider(client=transport.client(), base_url="https://gitea.example.com", token="t")

    await provider.list_tree("acme/api", "main")

    assert len(transport.requests) == GITEA_MAX_TREE_PAGES
