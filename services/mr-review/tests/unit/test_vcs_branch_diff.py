"""Unit tests for VCS providers' get_branch_diff implementations."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from mr_review.infra.vcs.github import GitHubProvider
from mr_review.infra.vcs.gitlab import GitLabProvider

pytestmark = pytest.mark.unit


def _stub_http_response(json_body: Any, status_code: int = 200, text: str = "") -> MagicMock:
    response = MagicMock(spec=httpx.Response)
    response.status_code = status_code
    response.json.return_value = json_body
    response.text = text
    response.raise_for_status = MagicMock()
    return response


async def test__github_get_branch_diff__single_page__parses_files() -> None:
    """GitHubProvider.get_branch_diff returns DiffFile objects from /compare/."""
    client = AsyncMock(spec=httpx.AsyncClient)
    first_page = _stub_http_response(
        {
            "files": [
                {
                    "filename": "src/a.py",
                    "patch": "@@ -1 +1 @@\n-old\n+new\n",
                    "additions": 1,
                    "deletions": 1,
                }
            ]
        }
    )
    empty_page = _stub_http_response({"files": []})
    client.get.side_effect = [first_page, empty_page]
    provider = GitHubProvider(client=client, base_url="https://github.com", token="t")

    files = await provider.get_branch_diff("owner/repo", "main", "feature/x")

    assert len(files) == 1
    assert files[0].path == "src/a.py"
    assert files[0].additions == 1
    assert files[0].deletions == 1
    # Verify the compare endpoint was called
    first_call_url = client.get.call_args_list[0].args[0]
    assert "compare/main...feature/x" in first_call_url


async def test__gitlab_get_branch_diff__parses_diffs_field() -> None:
    """GitLabProvider.get_branch_diff parses the ``diffs`` field of /compare."""
    client = AsyncMock(spec=httpx.AsyncClient)
    raw_diff = "@@ -1 +1 @@\n-old\n+new\n"
    response = _stub_http_response(
        {
            "diffs": [
                {"new_path": "src/b.py", "old_path": "src/b.py", "diff": raw_diff},
            ]
        }
    )
    client.get.return_value = response
    provider = GitLabProvider(client=client, base_url="https://gitlab.example.com", token="t")

    files = await provider.get_branch_diff("group/project", "main", "feature/y")

    assert len(files) == 1
    assert files[0].path == "src/b.py"
    assert files[0].additions == 1
    assert files[0].deletions == 1
    called_url = client.get.call_args.args[0]
    assert "repository/compare" in called_url
    params = client.get.call_args.kwargs["params"]
    assert params["from"] == "main"
    assert params["to"] == "feature/y"
