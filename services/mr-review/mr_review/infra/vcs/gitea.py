from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

from mr_review.core.mrs.entities import MR, DiffFile, Repo
from mr_review.infra.vcs._diff_parser import parse_datetime as _parse_datetime
from mr_review.infra.vcs._diff_parser import parse_patch_to_hunks as _parse_patch_to_hunks


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

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        url = f"{self._base_url}/api/v1{path}"
        response = await self._client.get(url, headers=self._headers, params=params)
        response.raise_for_status()
        return response.json()

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

    async def list_repos(self, query: str | None = None) -> list[Repo]:
        repos: list[Repo] = []
        page = 1
        base_params: dict[str, Any] = {"limit": 50, "sort": "newest"}
        if query:
            base_params["q"] = query
        while page <= 100:
            data: dict[str, Any] = await self._get(
                "/repos/search",
                params={**base_params, "page": page},
            )
            items: list[dict[str, Any]] = data.get("data", []) if isinstance(data, dict) else []
            if not items:
                break
            repos.extend(
                Repo(
                    id=str(item["id"]),
                    path=str(item["full_name"]),
                    name=str(item["name"]),
                    description=item.get("description") or None,
                )
                for item in items
            )
            if len(items) < 50:
                break
            page += 1
        return repos

    async def list_mrs(self, repo_path: str, state: str = "opened") -> list[MR]:
        owner, repo = _split_repo_path(repo_path)
        gitea_state = "open" if state == "opened" else state
        mrs: list[MR] = []
        page = 1
        while page <= 100:
            data: list[dict[str, Any]] = await self._get(
                f"/repos/{owner}/{repo}/pulls",
                params={"state": gitea_state, "limit": 50, "page": page},
            )
            if not data:
                break
            mrs.extend(_pr_to_mr(item) for item in data)
            if len(data) < 50:
                break
            page += 1
        return mrs

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


def _pr_to_mr(item: dict[str, Any]) -> MR:
    state = str(item.get("state", "closed"))
    merged = item.get("merged", False)
    if merged:
        status = "merged"
    elif state == "open":
        status = "opened"
    else:
        status = "closed"

    head: dict[str, Any] = item.get("head", {})
    base: dict[str, Any] = item.get("base", {})

    additions = int(item.get("additions", 0) or 0)
    deletions = int(item.get("deletions", 0) or 0)
    changed_files = int(item.get("changed_files", 0) or 0)

    return MR(
        iid=int(item["number"]),
        title=str(item["title"]),
        description=str(item.get("body") or ""),
        author=str(item["user"]["login"]),
        source_branch=str(head.get("label", head.get("ref", ""))),
        target_branch=str(base.get("label", base.get("ref", ""))),
        status=status,
        draft=bool(item.get("draft", False)),
        pipeline=None,
        additions=additions,
        deletions=deletions,
        file_count=changed_files,
        web_url=str(item.get("html_url", "")),
        created_at=_parse_datetime(str(item["created_at"])),
        updated_at=_parse_datetime(str(item["updated_at"])),
    )


def _encode_path(repo_path: str) -> str:
    return quote(repo_path, safe="")
