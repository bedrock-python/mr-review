"""GitLabProvider diffs: paginated /diffs with a /changes fallback, diff_refs from the MR itself."""

from __future__ import annotations

from typing import Any

import httpx
import pytest
from mr_review.infra.vcs.gitlab import GitLabProvider

from tests.factories.vcs_http import RoutedTransport, json_response

pytestmark = pytest.mark.unit

_PROJECT = "/api/v4/projects/group%2Fsub%2Fproj"


def _mr(iid: int, **extra: Any) -> dict[str, Any]:
    return {
        "iid": iid,
        "title": f"MR {iid}",
        "description": None,
        "author": {"username": "dev"},
        "source_branch": "feature",
        "target_branch": "main",
        "state": "opened",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-02T00:00:00Z",
        **extra,
    }


def _provider(transport: RoutedTransport) -> GitLabProvider:
    return GitLabProvider(client=transport.client(), base_url="https://gitlab.example.com", token="t")


async def test__get_diff__pages_through_diffs_endpoint_and_counts_lines() -> None:
    def diffs(request: httpx.Request) -> httpx.Response:
        page = request.url.params["page"]
        if page == "1":
            body = [{"old_path": "a.py", "new_path": "a.py", "diff": "@@ -1,2 +1,2 @@\n-x\n+y\n+z\n ctx\n"}]
            return json_response(body, headers={"X-Next-Page": "2"})
        body = [{"old_path": "old.py", "new_path": "new.py", "diff": "@@ -1 +0,0 @@\n-gone\n"}]
        return json_response(body, headers={"X-Next-Page": ""})

    transport = RoutedTransport({f"{_PROJECT}/merge_requests/9/diffs": diffs})

    files = await _provider(transport).get_diff("group/sub/proj", 9)

    assert [(f.path, f.old_path, f.additions, f.deletions) for f in files] == [
        ("a.py", None, 2, 1),
        ("new.py", "old.py", 0, 1),
    ]
    assert [r.url.params["page"] for r in transport.requests] == ["1", "2"]


async def test__get_diff__old_gitlab_without_diffs_endpoint__falls_back_to_changes() -> None:
    transport = RoutedTransport(
        {
            f"{_PROJECT}/merge_requests/9/diffs": json_response({"message": "404 Not found"}, status_code=404),
            f"{_PROJECT}/merge_requests/9/changes": json_response(
                {"changes": [{"old_path": "a.py", "new_path": "a.py", "diff": "@@ -1 +1 @@\n-a\n+b\n"}]}
            ),
        }
    )

    files = await _provider(transport).get_diff("group/sub/proj", 9)

    assert [(f.path, f.additions, f.deletions) for f in files] == [("a.py", 1, 1)]


async def test__get_diff__other_errors__are_not_masked_by_the_fallback() -> None:
    transport = RoutedTransport(
        {f"{_PROJECT}/merge_requests/9/diffs": json_response({"message": "403 Forbidden"}, status_code=403)}
    )

    with pytest.raises(httpx.HTTPStatusError):
        await _provider(transport).get_diff("group/sub/proj", 9)
    assert len(transport.requests) == 1


async def test__get_diff_refs__reads_the_mr_detail_not_the_changes_payload() -> None:
    detail = _mr(9, diff_refs={"base_sha": "b", "start_sha": "s", "head_sha": "h"})
    transport = RoutedTransport({f"{_PROJECT}/merge_requests/9": json_response(detail)})

    refs = await _provider(transport).get_diff_refs("group/sub/proj", 9)

    assert refs == {"base_sha": "b", "start_sha": "s", "head_sha": "h"}
    assert transport.paths() == [f"{_PROJECT}/merge_requests/9"]
