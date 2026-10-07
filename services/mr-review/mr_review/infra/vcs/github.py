from __future__ import annotations

import base64
import logging
from typing import Any, Literal
from urllib.parse import urlsplit

import httpx

from mr_review.core.mrs.entities import MR, DiffFile, InboxMR, MRStateFilter, PersonalMRScope, Repo
from mr_review.core.pagination import DEFAULT_MRS_PER_PAGE, DEFAULT_REPOS_PER_PAGE, Page
from mr_review.infra.vcs._diff_parser import parse_datetime as _parse_datetime
from mr_review.infra.vcs._diff_parser import parse_patch_to_hunks as _parse_patch_to_hunks
from mr_review.infra.vcs._pagination import has_next_link, json_list, optional_int


def _split_repo_path(repo_path: str) -> tuple[str, str]:
    """Split 'owner/repo' into (owner, repo)."""
    parts = repo_path.split("/", 1)
    if len(parts) != 2:
        raise ValueError(f"Invalid GitHub repo path: {repo_path!r}. Expected 'owner/repo'.")
    return parts[0], parts[1]


_GITHUB_API = "https://api.github.com"
_PUBLIC_GITHUB_HOSTS = frozenset({"github.com", "www.github.com", "api.github.com"})

# Search qualifiers per MR state. The pulls API cannot tell merged from closed,
# so those two states (and title searches) go through the issue search API.
_SEARCH_STATE_QUALIFIERS: dict[MRStateFilter, tuple[str, ...]] = {
    "opened": ("is:open",),
    "merged": ("is:merged",),
    "closed": ("is:closed", "is:unmerged"),
    "all": (),
}

_PERSONAL_SCOPE_QUALIFIERS: dict[PersonalMRScope, str] = {
    "authored": "author:@me",
    "assigned": "assignee:@me",
    "review_requested": "review-requested:@me",
}


def _resolve_api_base_url(base_url: str) -> str:
    """Map a user-supplied GitHub URL to the correct REST API base URL.

    github.com, www.github.com, api.github.com (any scheme, path or trailing slash) or empty
        → https://api.github.com
    GitHub Enterprise: https://ghe.company.com → https://ghe.company.com/api/v3 (kept if already there)
    """
    url = base_url.strip().rstrip("/")
    if not url:
        return _GITHUB_API
    if "://" not in url:
        url = f"https://{url}"
    if (urlsplit(url).hostname or "").lower() in _PUBLIC_GITHUB_HOSTS:
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

    async def _get_response(self, path: str, params: dict[str, Any] | None = None) -> httpx.Response:
        url = f"{self._base_url}{path}"
        response = await self._client.get(url, headers=self._headers, params=params)
        response.raise_for_status()
        return response

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return (await self._get_response(path, params)).json()

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

    async def list_repos(
        self, query: str | None = None, page: int = 1, per_page: int = DEFAULT_REPOS_PER_PAGE
    ) -> Page[Repo]:
        if query:
            response = await self._get_response(
                "/search/repositories",
                params={"q": query, "sort": "updated", "order": "desc", "per_page": per_page, "page": page},
            )
            items: list[dict[str, Any]] = response.json().get("items", [])
        else:
            response = await self._get_response(
                "/user/repos",
                params={"type": "all", "sort": "updated", "direction": "desc", "per_page": per_page, "page": page},
            )
            items = json_list(response)
        return Page(
            items=[_item_to_repo(item) for item in items],
            page=page,
            per_page=per_page,
            has_more=has_next_link(response),
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
        owner, repo = _split_repo_path(repo_path)
        if not query and state in ("opened", "all"):
            response = await self._get_response(
                f"/repos/{owner}/{repo}/pulls",
                params={
                    "state": "open" if state == "opened" else "all",
                    "sort": "updated",
                    "direction": "desc",
                    "per_page": per_page,
                    "page": page,
                },
            )
            return Page(
                items=[_pr_to_mr(item) for item in json_list(response)],
                page=page,
                per_page=per_page,
                has_more=has_next_link(response),
            )

        qualifiers = [f"repo:{owner}/{repo}", "is:pr", *_SEARCH_STATE_QUALIFIERS[state]]
        if query:
            qualifiers.extend([_search_terms(query), "in:title"])
        items, has_more = await self._search_issues(" ".join(qualifiers), page, per_page)
        return Page(
            items=[_search_item_to_mr(item) for item in items],
            page=page,
            per_page=per_page,
            has_more=has_more,
        )

    async def list_my_mrs(
        self, scope: PersonalMRScope, page: int = 1, per_page: int = DEFAULT_MRS_PER_PAGE
    ) -> Page[InboxMR]:
        search = f"is:pr is:open archived:false {_PERSONAL_SCOPE_QUALIFIERS[scope]}"
        items, has_more = await self._search_issues(search, page, per_page)
        return Page(
            items=[
                InboxMR(mr=_search_item_to_mr(item), repo_path=_repo_path_from_api_url(str(item["repository_url"])))
                for item in items
            ],
            page=page,
            per_page=per_page,
            has_more=has_more,
        )

    async def _search_issues(self, search: str, page: int, per_page: int) -> tuple[list[dict[str, Any]], bool]:
        response = await self._get_response(
            "/search/issues",
            params={"q": search, "sort": "updated", "order": "desc", "per_page": per_page, "page": page},
        )
        items: list[dict[str, Any]] = response.json().get("items", [])
        return items, has_next_link(response)

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


def _item_to_repo(item: dict[str, Any]) -> Repo:
    return Repo(
        id=str(item["id"]),
        path=str(item["full_name"]),
        name=str(item["name"]),
        description=item.get("description"),
    )


def _status(gh_state: str, merged_at: object) -> Literal["opened", "merged", "closed"]:
    if merged_at:
        return "merged"
    return "opened" if gh_state == "open" else "closed"


def _pr_to_mr(item: dict[str, Any]) -> MR:
    """Map a pull request object (pulls API). Stats are only present on the single-PR endpoint."""
    return MR(
        iid=int(item["number"]),
        title=str(item["title"]),
        description=str(item.get("body") or ""),
        author=str(item["user"]["login"]),
        source_branch=str(item["head"]["ref"]),
        target_branch=str(item["base"]["ref"]),
        status=_status(str(item.get("state", "closed")), item.get("merged_at")),
        draft=bool(item.get("draft", False)),
        pipeline=None,
        additions=optional_int(item.get("additions")),
        deletions=optional_int(item.get("deletions")),
        file_count=optional_int(item.get("changed_files")),
        web_url=str(item.get("html_url", "")),
        created_at=_parse_datetime(str(item["created_at"])),
        updated_at=_parse_datetime(str(item["updated_at"])),
    )


def _search_item_to_mr(item: dict[str, Any]) -> MR:
    """Map an issue-search hit. Search results carry no branch names and no diff stats."""
    pull: dict[str, Any] = item.get("pull_request") or {}
    return MR(
        iid=int(item["number"]),
        title=str(item["title"]),
        description=str(item.get("body") or ""),
        author=str(item["user"]["login"]),
        source_branch="",
        target_branch="",
        status=_status(str(item.get("state", "closed")), pull.get("merged_at")),
        draft=bool(item.get("draft", False)),
        pipeline=None,
        web_url=str(item.get("html_url", "")),
        created_at=_parse_datetime(str(item["created_at"])),
        updated_at=_parse_datetime(str(item["updated_at"])),
    )


def _search_terms(query: str) -> str:
    """User text for a search query; quotes are dropped so they cannot unbalance the query."""
    return " ".join(query.replace('"', " ").split())


def _repo_path_from_api_url(repository_url: str) -> str:
    """``https://api.github.com/repos/owner/repo`` (or the GHE equivalent) -> ``owner/repo``."""
    return "/".join(repository_url.rstrip("/").split("/")[-2:])
