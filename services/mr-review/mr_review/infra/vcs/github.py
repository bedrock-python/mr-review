from __future__ import annotations

import base64
import logging
from typing import Any

import httpx

from mr_review.core.mrs.entities import MR, DiffFile, Repo
from mr_review.infra.vcs._diff_parser import parse_datetime as _parse_datetime
from mr_review.infra.vcs._diff_parser import parse_patch_to_hunks as _parse_patch_to_hunks


def _split_repo_path(repo_path: str) -> tuple[str, str]:
    """Split 'owner/repo' into (owner, repo)."""
    parts = repo_path.split("/", 1)
    if len(parts) != 2:
        raise ValueError(f"Invalid GitHub repo path: {repo_path!r}. Expected 'owner/repo'.")
    return parts[0], parts[1]


_GITHUB_COM = "https://github.com"
_GITHUB_API = "https://api.github.com"


def _resolve_api_base_url(base_url: str) -> str:
    """Map a user-supplied GitHub URL to the correct REST API base URL.

    GitHub.com: https://github.com → https://api.github.com
    GitHub Enterprise: https://ghe.company.com → https://ghe.company.com/api/v3
    Empty/unset: default to https://api.github.com
    """
    url = base_url.rstrip("/") if base_url else ""
    if not url:
        return _GITHUB_API
    if url.rstrip("/").lower() == _GITHUB_COM:
        return _GITHUB_API
    # GitHub Enterprise Server exposes the API under /api/v3
    if not url.endswith("/api/v3"):
        return f"{url}/api/v3"
    return url


class GitHubProvider:
    def __init__(self, client: httpx.AsyncClient, base_url: str, token: str) -> None:
        self._client = client
        self._base_url = _resolve_api_base_url(base_url)
        self._token = token
        self._headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        url = f"{self._base_url}{path}"
        response = await self._client.get(url, headers=self._headers, params=params)
        response.raise_for_status()
        return response.json()

    async def _post(self, path: str, json_body: dict[str, Any]) -> Any:
        url = f"{self._base_url}{path}"
        response = await self._client.post(url, headers=self._headers, json=json_body)
        response.raise_for_status()
        return response.json()

    async def test_connection(self) -> dict[str, str]:
        data: dict[str, Any] = await self._get("/user")
        return {
            "username": str(data.get("login", "")),
            "name": str(data.get("name", "") or ""),
            "email": str(data.get("email", "") or ""),
        }

    async def list_repos(self, query: str | None = None) -> list[Repo]:
        if query:
            return await self._search_repos(query)
        repos: list[Repo] = []
        page = 1
        while True:
            data: list[dict[str, Any]] = await self._get(
                "/user/repos",
                params={"per_page": 100, "page": page, "sort": "updated", "type": "all"},
            )
            if not data:
                break
            repos.extend(
                Repo(
                    id=str(item["id"]),
                    path=str(item["full_name"]),
                    name=str(item["name"]),
                    description=item.get("description"),
                )
                for item in data
            )
            if len(data) < 100:
                break
            page += 1
        return repos

    async def _search_repos(self, query: str) -> list[Repo]:
        repos: list[Repo] = []
        page = 1
        while True:
            data: dict[str, Any] = await self._get(
                "/search/repositories",
                params={"q": query, "per_page": 100, "page": page, "sort": "updated"},
            )
            items: list[dict[str, Any]] = data.get("items", [])
            if not items:
                break
            repos.extend(
                Repo(
                    id=str(item["id"]),
                    path=str(item["full_name"]),
                    name=str(item["name"]),
                    description=item.get("description"),
                )
                for item in items
            )
            total_count: int = int(data.get("total_count", 0))
            if len(repos) >= total_count or len(items) < 100:
                break
            page += 1
        return repos

    async def list_mrs(self, repo_path: str, state: str = "opened") -> list[MR]:
        owner, repo = _split_repo_path(repo_path)
        gh_state = "open" if state == "opened" else state
        mrs: list[MR] = []
        page = 1
        while True:
            data: list[dict[str, Any]] = await self._get(
                f"/repos/{owner}/{repo}/pulls",
                params={"state": gh_state, "per_page": 100, "page": page},
            )
            if not data:
                break
            mrs.extend(_pr_to_mr(item) for item in data)
            if len(data) < 100:
                break
            page += 1
        return mrs

    async def get_mr(self, repo_path: str, mr_iid: int) -> MR:
        owner, repo = _split_repo_path(repo_path)
        data: dict[str, Any] = await self._get(f"/repos/{owner}/{repo}/pulls/{mr_iid}")
        return _pr_to_mr(data)

    async def get_diff(self, repo_path: str, mr_iid: int) -> list[DiffFile]:
        owner, repo = _split_repo_path(repo_path)
        files: list[dict[str, Any]] = []
        page = 1
        while page <= 100:
            page_data: list[dict[str, Any]] = await self._get(
                f"/repos/{owner}/{repo}/pulls/{mr_iid}/files",
                params={"per_page": 100, "page": page},
            )
            if not page_data:
                break
            files.extend(page_data)
            if len(page_data) < 100:
                break
            page += 1
        diff_files: list[DiffFile] = []
        for f in files:
            patch = f.get("patch", "")
            hunks = _parse_patch_to_hunks(patch) if patch else []
            filename = str(f["filename"])
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
        files: list[dict[str, Any]] = []
        page = 1
        while page <= 100:
            page_data: dict[str, Any] = await self._get(
                f"/repos/{owner}/{repo}/compare/{base_ref}...{head_ref}",
                params={"per_page": 100, "page": page},
            )
            page_files: list[dict[str, Any]] = page_data.get("files", []) or []
            if not page_files:
                break
            files.extend(page_files)
            if len(page_files) < 100:
                break
            page += 1
        diff_files: list[DiffFile] = []
        for f in files:
            patch = f.get("patch", "")
            hunks = _parse_patch_to_hunks(patch) if patch else []
            filename = str(f["filename"])
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
            f"/repos/{owner}/{repo}/pulls/{mr_iid}/comments",
            {
                "body": body,
                "commit_id": commit_id,
                "path": file,
                "line": line,
                "side": "RIGHT",
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
        url = f"{self._base_url}/repos/{owner}/{repo}/contents/{file_path}"
        response = await self._client.get(url, headers=self._headers, params={"ref": ref})
        if response.status_code == 404:
            return None
        response.raise_for_status()
        data: Any = response.json()
        if isinstance(data, list):
            return None
        encoding = data.get("encoding", "")
        content = data.get("content", "")
        if encoding == "base64":
            return base64.b64decode(content).decode("utf-8", errors="replace")
        return str(content)

    async def list_directory(self, repo_path: str, dir_path: str, ref: str = "HEAD") -> list[str]:
        owner, repo = _split_repo_path(repo_path)
        url = f"{self._base_url}/repos/{owner}/{repo}/git/trees/{ref}"
        response = await self._client.get(url, headers=self._headers, params={"recursive": "1"})
        if response.status_code == 404:
            return []
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        if data.get("truncated"):
            logging.getLogger(__name__).warning(
                "GitHub git tree for %s@%s is truncated; some files may be missing", repo_path, ref
            )
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
            params={"path": file_path, "sha": ref, "per_page": limit},
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
    gh_state = str(item.get("state", "closed"))
    merged_at = item.get("merged_at")
    if merged_at:
        status = "merged"
    elif gh_state == "open":
        status = "opened"
    else:
        status = "closed"

    title = str(item["title"])
    is_draft = bool(item.get("draft", False))

    return MR(
        iid=int(item["number"]),
        title=title,
        description=str(item.get("body") or ""),
        author=str(item["user"]["login"]),
        source_branch=str(item["head"]["ref"]),
        target_branch=str(item["base"]["ref"]),
        status=status,
        draft=is_draft,
        pipeline=None,
        additions=int(item.get("additions", 0)),
        deletions=int(item.get("deletions", 0)),
        file_count=int(item.get("changed_files", 0)),
        web_url=str(item.get("html_url", "")),
        created_at=_parse_datetime(str(item["created_at"])),
        updated_at=_parse_datetime(str(item["updated_at"])),
    )
