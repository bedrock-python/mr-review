from __future__ import annotations

from typing import Any, Literal
from urllib.parse import quote

import httpx

from mr_review.core.mrs.entities import MR, DiffFile, InboxMR, MRStateFilter, PersonalMRScope, Repo
from mr_review.core.pagination import DEFAULT_MRS_PER_PAGE, DEFAULT_REPOS_PER_PAGE, Page
from mr_review.infra.vcs._diff_parser import parse_datetime as _parse_datetime
from mr_review.infra.vcs._diff_parser import parse_full_diff as _parse_full_diff
from mr_review.infra.vcs._diff_parser import parse_patch_to_hunks as _parse_patch_to_hunks
from mr_review.infra.vcs._pagination import (
    filter_by_title,
    gitea_has_more,
    json_list,
    optional_int,
    optional_str,
)

# The pulls API filters by open/closed only; merged vs. closed is told apart per item.
_UPSTREAM_STATE: dict[MRStateFilter, str] = {
    "opened": "open",
    "merged": "closed",
    "closed": "closed",
    "all": "all",
}

_PERSONAL_SCOPE_PARAMS: dict[PersonalMRScope, str] = {
    "authored": "created",
    "assigned": "assigned",
    "review_requested": "review_requested",
}


def _split_repo_path(repo_path: str) -> tuple[str, str]:
    """Split 'owner/repo' into (owner, repo)."""
    parts = repo_path.split("/", 1)
    if len(parts) != 2:
        raise ValueError(f"Invalid Gitea repo path: {repo_path!r}. Expected 'owner/repo'.")
    return parts[0], parts[1]


class GiteaProvider:
    """Gitea/Forgejo VCS provider (Gitea Swagger API v1)."""

    def __init__(self, client: httpx.AsyncClient, base_url: str, token: str) -> None:
        self._client = client
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._headers = {
            "Authorization": f"token {token}",
            "Content-Type": "application/json",
        }

    async def _get_response(self, path: str, params: dict[str, Any] | None = None) -> httpx.Response:
        url = f"{self._base_url}/api/v1{path}"
        response = await self._client.get(url, headers=self._headers, params=params)
        response.raise_for_status()
        return response

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return (await self._get_response(path, params)).json()

    async def _post(self, path: str, json_body: dict[str, Any]) -> Any:
        url = f"{self._base_url}/api/v1{path}"
        response = await self._client.post(url, headers=self._headers, json=json_body)
        response.raise_for_status()
        return response.json()

    async def test_connection(self) -> dict[str, str]:
        data: dict[str, Any] = await self._get("/user")
        return {
            "username": str(data.get("login", "")),
            "name": str(data.get("full_name", "") or ""),
            "email": str(data.get("email", "") or ""),
        }

    async def list_repos(
        self, query: str | None = None, page: int = 1, per_page: int = DEFAULT_REPOS_PER_PAGE
    ) -> Page[Repo]:
        params: dict[str, Any] = {"sort": "updated", "order": "desc", "limit": per_page, "page": page}
        if query:
            params["q"] = query
        response = await self._get_response("/repos/search", params=params)
        data: Any = response.json()
        items: list[dict[str, Any]] = (data.get("data") or []) if isinstance(data, dict) else []
        return Page(
            items=[_item_to_repo(item) for item in items],
            page=page,
            per_page=per_page,
            has_more=gitea_has_more(response, len(items), per_page),
        )

    async def get_repo(self, repo_path: str) -> Repo:
        owner, repo = _split_repo_path(repo_path)
        data: dict[str, Any] = await self._get(f"/repos/{owner}/{repo}")
        return _item_to_repo(data)

    async def list_mrs(
        self,
        repo_path: str,
        state: MRStateFilter = "opened",
        page: int = 1,
        per_page: int = DEFAULT_MRS_PER_PAGE,
        query: str | None = None,
    ) -> Page[MR]:
        """One upstream page of pull requests.

        The pulls API can neither split merged from closed nor search titles, so both are applied to
        the fetched page: such a page can hold fewer than ``per_page`` items while ``has_more`` is true.
        """
        owner, repo = _split_repo_path(repo_path)
        response = await self._get_response(
            f"/repos/{owner}/{repo}/pulls",
            params={"state": _UPSTREAM_STATE[state], "sort": "recentupdate", "limit": per_page, "page": page},
        )
        raw = json_list(response)
        mrs = [_pr_to_mr(item) for item in raw]
        if state in ("merged", "closed"):
            mrs = [mr for mr in mrs if mr.status == state]
        return Page(
            items=filter_by_title(mrs, query),
            page=page,
            per_page=per_page,
            has_more=gitea_has_more(response, len(raw), per_page),
        )

    async def list_my_mrs(
        self, scope: PersonalMRScope, page: int = 1, per_page: int = DEFAULT_MRS_PER_PAGE
    ) -> Page[InboxMR]:
        response = await self._get_response(
            "/repos/issues/search",
            params={
                "type": "pulls",
                "state": "open",
                _PERSONAL_SCOPE_PARAMS[scope]: "true",
                "limit": per_page,
                "page": page,
            },
        )
        raw = json_list(response)
        return Page(
            items=[
                InboxMR(mr=_issue_to_mr(item), repo_path=str((item.get("repository") or {}).get("full_name", "")))
                for item in raw
            ],
            page=page,
            per_page=per_page,
            has_more=gitea_has_more(response, len(raw), per_page),
        )

    async def get_mr(self, repo_path: str, mr_iid: int) -> MR:
        owner, repo = _split_repo_path(repo_path)
        data: dict[str, Any] = await self._get(f"/repos/{owner}/{repo}/pulls/{mr_iid}")
        return _pr_to_mr(data)

    async def get_diff(self, repo_path: str, mr_iid: int) -> list[DiffFile]:
        owner, repo = _split_repo_path(repo_path)
        files: list[dict[str, Any]] = await self._get(f"/repos/{owner}/{repo}/pulls/{mr_iid}/files")
        diff_files: list[DiffFile] = []
        for f in files:
            patch = f.get("patch", "")
            hunks = _parse_patch_to_hunks(patch) if patch else []
            filename = str(f.get("filename", ""))
            previous_filename = f.get("previous_filename")
            diff_files.append(
                DiffFile(
                    path=filename,
                    old_path=previous_filename if previous_filename and previous_filename != filename else None,
                    additions=int(f.get("additions", 0)),
                    deletions=int(f.get("deletions", 0)),
                    hunks=hunks,
                )
            )
        return diff_files

    async def get_branch_diff(self, repo_path: str, base_ref: str, head_ref: str) -> list[DiffFile]:
        owner, repo = _split_repo_path(repo_path)
        # Gitea exposes branch comparison as a unified diff at
        # /repos/{owner}/{repo}/compare/{base}...{head}.diff
        encoded_base = quote(base_ref, safe="")
        encoded_head = quote(head_ref, safe="")
        url = f"{self._base_url}/api/v1/repos/{owner}/{repo}/compare/{encoded_base}...{encoded_head}.diff"
        response = await self._client.get(url, headers=self._headers)
        if response.status_code == 404:
            return []
        response.raise_for_status()
        return _parse_full_diff(response.text)

    async def get_diff_refs(self, repo_path: str, mr_iid: int) -> dict[str, str]:
        owner, repo = _split_repo_path(repo_path)
        data: dict[str, Any] = await self._get(f"/repos/{owner}/{repo}/pulls/{mr_iid}")
        head_sha = str(data.get("head", {}).get("sha", ""))
        return {"head_sha": head_sha}

    async def post_inline_comment(
        self,
        repo_path: str,
        mr_iid: int,
        diff_refs: dict[str, str],
        file: str,
        line: int,
        body: str,
    ) -> None:
        owner, repo = _split_repo_path(repo_path)
        commit_id = diff_refs.get("head_sha", "")
        await self._post(
            f"/repos/{owner}/{repo}/pulls/{mr_iid}/reviews",
            {
                "commit_id": commit_id,
                "body": "",
                "event": "COMMENT",
                "comments": [
                    {
                        "path": file,
                        "new_position": line,
                        "body": body,
                    }
                ],
            },
        )

    async def post_general_note(self, repo_path: str, mr_iid: int, body: str) -> None:
        owner, repo = _split_repo_path(repo_path)
        await self._post(
            f"/repos/{owner}/{repo}/issues/{mr_iid}/comments",
            {"body": body},
        )

    async def get_file(self, repo_path: str, file_path: str, ref: str = "HEAD") -> str | None:
        owner, repo = _split_repo_path(repo_path)
        url = f"{self._base_url}/api/v1/repos/{owner}/{repo}/raw/{file_path}"
        response = await self._client.get(url, headers=self._headers, params={"ref": ref})
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.text

    async def list_directory(self, repo_path: str, dir_path: str, ref: str = "HEAD") -> list[str]:
        owner, repo = _split_repo_path(repo_path)
        url = f"{self._base_url}/api/v1/repos/{owner}/{repo}/git/trees/{ref}"
        response = await self._client.get(url, headers=self._headers, params={"recursive": "true"})
        if response.status_code == 404:
            return []
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        prefix = dir_path.rstrip("/") + "/"
        return [
            item["path"]
            for item in data.get("tree", [])
            if item.get("type") == "blob" and item.get("path", "").startswith(prefix)
        ]

    async def get_commits(
        self, repo_path: str, file_path: str, ref: str = "HEAD", limit: int = 10
    ) -> list[dict[str, str]]:
        owner, repo = _split_repo_path(repo_path)
        data: list[dict[str, Any]] = await self._get(
            f"/repos/{owner}/{repo}/commits",
            params={"path": file_path, "sha": ref, "limit": limit},
        )
        result: list[dict[str, str]] = []
        for item in data:
            commit: dict[str, Any] = item.get("commit", {})
            author: dict[str, Any] = commit.get("author") or {}
            result.append(
                {
                    "id": str(item.get("sha", ""))[:8],
                    "title": str(commit.get("message", "")).split("\n")[0],
                    "author": str(author.get("name", "")),
                    "date": str(author.get("date", "")),
                }
            )
        return result


def _status(state: str, merged: object) -> Literal["opened", "merged", "closed"]:
    if merged:
        return "merged"
    return "opened" if state == "open" else "closed"


def _item_to_repo(item: dict[str, Any]) -> Repo:
    return Repo(
        id=str(item["id"]),
        path=str(item["full_name"]),
        name=str(item["name"]),
        description=item.get("description") or None,
    )


def _pr_to_mr(item: dict[str, Any]) -> MR:
    """Map a pull request object. Older Gitea releases don't report diff stats at all."""
    head: dict[str, Any] = item.get("head", {})
    base: dict[str, Any] = item.get("base", {})
    return MR(
        iid=int(item["number"]),
        title=str(item["title"]),
        description=str(item.get("body") or ""),
        author=str(item["user"]["login"]),
        source_branch=str(head.get("label", head.get("ref", ""))),
        target_branch=str(base.get("label", base.get("ref", ""))),
        status=_status(str(item.get("state", "closed")), item.get("merged", False)),
        draft=bool(item.get("draft", False)),
        pipeline=None,
        additions=optional_int(item.get("additions")),
        deletions=optional_int(item.get("deletions")),
        file_count=optional_int(item.get("changed_files")),
        web_url=str(item.get("html_url", "")),
        created_at=_parse_datetime(str(item["created_at"])),
        updated_at=_parse_datetime(str(item["updated_at"])),
        head_sha=optional_str(head.get("sha")),
    )


def _issue_to_mr(item: dict[str, Any]) -> MR:
    """Map an issue-search hit for a pull request: no branch names and no diff stats in this view."""
    pull: dict[str, Any] = item.get("pull_request") or {}
    return MR(
        iid=int(item["number"]),
        title=str(item["title"]),
        description=str(item.get("body") or ""),
        author=str(item["user"]["login"]),
        source_branch="",
        target_branch="",
        status=_status(str(item.get("state", "closed")), pull.get("merged", False)),
        draft=bool(pull.get("draft", False)),
        pipeline=None,
        web_url=str(pull.get("html_url") or item.get("html_url", "")),
        created_at=_parse_datetime(str(item["created_at"])),
        updated_at=_parse_datetime(str(item["updated_at"])),
    )


def _encode_path(repo_path: str) -> str:
    return quote(repo_path, safe="")
