from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import quote

import httpx

from mr_review.core.mrs.entities import MR, DiffFile, InboxMR, MRStateFilter, PersonalMRScope, Repo
from mr_review.core.pagination import DEFAULT_MRS_PER_PAGE, DEFAULT_REPOS_PER_PAGE, Page
from mr_review.infra.vcs._diff_parser import parse_full_diff as _parse_full_diff

_BITBUCKET_API = "https://api.bitbucket.org/2.0"

# Bitbucket's documented ``pagelen`` ceilings; a larger per_page is clamped to them, so such a page is shorter.
_REPOS_MAX_PAGELEN = 100
_PULLREQUESTS_MAX_PAGELEN = 50

_STATE_FILTER: dict[MRStateFilter, list[str]] = {
    "opened": ["OPEN"],
    "merged": ["MERGED"],
    "closed": ["DECLINED", "SUPERSEDED"],
    "all": ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"],
}


def _parse_datetime(value: str) -> datetime:
    value = value.replace("Z", "+00:00")
    # Strip microseconds beyond 6 digits — Bitbucket occasionally emits 7+
    value = re.sub(r"(\.\d{6})\d+", r"\1", value)
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _split_repo_path(repo_path: str) -> tuple[str, str]:
    """Split 'workspace/repo-slug' into (workspace, repo_slug)."""
    parts = repo_path.split("/", 1)
    if len(parts) != 2:
        raise ValueError(f"Invalid Bitbucket repo path: {repo_path!r}. Expected 'workspace/repo-slug'.")
    return parts[0], parts[1]


class BitbucketProvider:
    """Bitbucket Cloud VCS provider (REST API 2.0).

    Authentication: App password via HTTP Basic (username + app_password).
    Token field stores the combined 'username:app_password' string.
    """

    def __init__(self, client: httpx.AsyncClient, base_url: str, token: str) -> None:
        self._client = client
        # base_url is ignored for Bitbucket Cloud; kept for interface compat
        self._api_url = _BITBUCKET_API
        # token expected as "username:app_password"
        if ":" in token:
            username, app_password = token.split(":", 1)
            self._auth: httpx.Auth | None = httpx.BasicAuth(username, app_password)
            self._username = username
        else:
            # Treat as Bearer token (Bitbucket OAuth)
            self._auth = None
            self._bearer = token
            self._username = ""
        # Resolved once per provider (the provider lives as long as the host's token doesn't change).
        self._user_uuid: str | None = None
        self._user_lock = asyncio.Lock()

    def _build_headers(self) -> dict[str, str]:
        if self._auth is None:
            return {"Authorization": f"Bearer {self._bearer}"}
        return {}

    def _request_kwargs(self) -> dict[str, Any]:
        if self._auth is not None:
            return {"auth": self._auth}
        return {}

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        url = f"{self._api_url}{path}"
        response = await self._client.get(
            url,
            headers=self._build_headers(),
            params=params,
            **self._request_kwargs(),
        )
        response.raise_for_status()
        return response.json()

    async def _get_page(self, path: str, params: dict[str, Any], page: int) -> tuple[list[dict[str, Any]], bool]:
        """One page of a paginated collection: its values and whether Bitbucket advertises a ``next`` page."""
        data: dict[str, Any] = await self._get(path, params={**params, "page": page})
        return list(data.get("values", [])), bool(data.get("next"))

    async def _get_paginated(
        self, url: str, params: dict[str, Any] | None = None, max_pages: int = 100
    ) -> list[dict[str, Any]]:
        """Follow Bitbucket's cursor-based pagination ('next' field)."""
        results: list[dict[str, Any]] = []
        next_url: str | None = url
        pages = 0
        while next_url and pages < max_pages:
            response = await self._client.get(
                next_url,
                headers=self._build_headers(),
                params=params,
                **self._request_kwargs(),
            )
            response.raise_for_status()
            data: dict[str, Any] = response.json()
            results.extend(data.get("values", []))
            next_url = data.get("next")
            params = None  # next URL already contains query params
            pages += 1
        return results

    async def _post(self, path: str, json_body: dict[str, Any]) -> Any:
        url = f"{self._api_url}{path}"
        response = await self._client.post(
            url,
            headers=self._build_headers(),
            json=json_body,
            **self._request_kwargs(),
        )
        response.raise_for_status()
        return response.json()

    async def test_connection(self) -> dict[str, str]:
        data: dict[str, Any] = await self._get("/user")
        return {
            "username": str(data.get("username", data.get("account_id", ""))),
            "name": str(data.get("display_name", "")),
            "email": "",  # Bitbucket requires separate /user/emails call
        }

    async def list_repos(
        self, query: str | None = None, page: int = 1, per_page: int = DEFAULT_REPOS_PER_PAGE
    ) -> Page[Repo]:
        workspace = self._username
        if not workspace:
            return Page(items=[], page=page, per_page=per_page, has_more=False)
        params: dict[str, Any] = {"sort": "-updated_on", "pagelen": min(per_page, _REPOS_MAX_PAGELEN)}
        if query:
            params["q"] = f"name ~ {_bbql_string(query)}"
        items, has_more = await self._get_page(f"/repositories/{workspace}", params, page)
        return Page(items=[_item_to_repo(item) for item in items], page=page, per_page=per_page, has_more=has_more)

    async def get_repo(self, repo_path: str) -> Repo:
        workspace, repo_slug = _split_repo_path(repo_path)
        data: dict[str, Any] = await self._get(f"/repositories/{workspace}/{repo_slug}")
        return _item_to_repo(data)

    async def list_mrs(
        self,
        repo_path: str,
        state: MRStateFilter = "opened",
        page: int = 1,
        per_page: int = DEFAULT_MRS_PER_PAGE,
        query: str | None = None,
    ) -> Page[MR]:
        workspace, repo_slug = _split_repo_path(repo_path)
        params: dict[str, Any] = {
            "state": _STATE_FILTER[state],
            "sort": "-updated_on",
            "pagelen": min(per_page, _PULLREQUESTS_MAX_PAGELEN),
        }
        if query:
            params["q"] = f"title ~ {_bbql_string(query)}"
        items, has_more = await self._get_page(f"/repositories/{workspace}/{repo_slug}/pullrequests", params, page)
        return Page(items=[_pr_to_mr(item) for item in items], page=page, per_page=per_page, has_more=has_more)

    async def list_my_mrs(
        self, scope: PersonalMRScope, page: int = 1, per_page: int = DEFAULT_MRS_PER_PAGE
    ) -> Page[InboxMR]:
        """Open PRs the token's user authored.

        Bitbucket has no assignees, and no cross-repository listing of PRs awaiting a user's review,
        so ``assigned`` and ``review_requested`` are always an empty page.
        """
        if scope != "authored":
            return Page(items=[], page=page, per_page=per_page, has_more=False)
        user = quote(await self._current_user_uuid(), safe="")
        params: dict[str, Any] = {
            "state": "OPEN",
            "sort": "-updated_on",
            "pagelen": min(per_page, _PULLREQUESTS_MAX_PAGELEN),
        }
        items, has_more = await self._get_page(f"/pullrequests/{user}", params, page)
        return Page(
            items=[InboxMR(mr=_pr_to_mr(item), repo_path=_pr_repo_path(item)) for item in items],
            page=page,
            per_page=per_page,
            has_more=has_more,
        )

    async def _current_user_uuid(self) -> str:
        if self._user_uuid is None:
            async with self._user_lock:
                if self._user_uuid is None:
                    data: dict[str, Any] = await self._get("/user")
                    self._user_uuid = str(data.get("uuid") or data.get("account_id") or self._username)
        return self._user_uuid

    async def get_mr(self, repo_path: str, mr_iid: int) -> MR:
        workspace, repo_slug = _split_repo_path(repo_path)

        pr_data, diffstat_items = await asyncio.gather(
            self._get(f"/repositories/{workspace}/{repo_slug}/pullrequests/{mr_iid}"),
            self._get_paginated(
                f"{self._api_url}/repositories/{workspace}/{repo_slug}/pullrequests/{mr_iid}/diffstat",
                params={"pagelen": 100},
            ),
        )
        additions = sum(int(f.get("lines_added", 0)) for f in diffstat_items)
        deletions = sum(int(f.get("lines_removed", 0)) for f in diffstat_items)
        file_count = len(diffstat_items)
        return _pr_to_mr(pr_data, additions=additions, deletions=deletions, file_count=file_count)

    async def get_diff(self, repo_path: str, mr_iid: int) -> list[DiffFile]:
        workspace, repo_slug = _split_repo_path(repo_path)
        # Bitbucket returns unified diff as plain text
        url = f"{self._api_url}/repositories/{workspace}/{repo_slug}/pullrequests/{mr_iid}/diff"
        response = await self._client.get(
            url,
            headers=self._build_headers(),
            **self._request_kwargs(),
        )
        response.raise_for_status()
        raw_diff = response.text
        return _parse_full_diff(raw_diff)

    async def get_branch_diff(self, repo_path: str, base_ref: str, head_ref: str) -> list[DiffFile]:
        workspace, repo_slug = _split_repo_path(repo_path)
        # Bitbucket's diff endpoint accepts ``spec={head}..{base}`` and returns
        # the unified diff. Order is reversed compared to git CLI: spec is
        # ``destination..source`` so that the diff represents head_ref's changes
        # on top of base_ref.
        url = f"{self._api_url}/repositories/{workspace}/{repo_slug}/diff/{head_ref}..{base_ref}"
        response = await self._client.get(
            url,
            headers=self._build_headers(),
            **self._request_kwargs(),
        )
        if response.status_code == 404:
            return []
        response.raise_for_status()
        return _parse_full_diff(response.text)

    async def get_diff_refs(self, repo_path: str, mr_iid: int) -> dict[str, str]:
        return {}

    async def post_inline_comment(
        self,
        repo_path: str,
        mr_iid: int,
        diff_refs: dict[str, str],
        file: str,
        line: int,
        body: str,
    ) -> None:
        workspace, repo_slug = _split_repo_path(repo_path)
        await self._post(
            f"/repositories/{workspace}/{repo_slug}/pullrequests/{mr_iid}/comments",
            {
                "content": {"raw": body},
                "inline": {
                    "to": line,
                    "path": file,
                },
            },
        )

    async def post_general_note(self, repo_path: str, mr_iid: int, body: str) -> None:
        workspace, repo_slug = _split_repo_path(repo_path)
        await self._post(
            f"/repositories/{workspace}/{repo_slug}/pullrequests/{mr_iid}/comments",
            {"content": {"raw": body}},
        )

    async def get_file(self, repo_path: str, file_path: str, ref: str = "HEAD") -> str | None:
        workspace, repo_slug = _split_repo_path(repo_path)
        url = f"{self._api_url}/repositories/{workspace}/{repo_slug}/src/{ref}/{file_path}"
        response = await self._client.get(url, headers=self._build_headers(), **self._request_kwargs())
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.text

    async def list_directory(self, repo_path: str, dir_path: str, ref: str = "HEAD") -> list[str]:
        workspace, repo_slug = _split_repo_path(repo_path)
        paths: list[str] = []
        url = f"{self._api_url}/repositories/{workspace}/{repo_slug}/src/{ref}/{dir_path}/"
        next_url: str | None = url
        while next_url:
            response = await self._client.get(
                next_url,
                headers=self._build_headers(),
                params={"pagelen": 100},
                **self._request_kwargs(),
            )
            if response.status_code == 404:
                return []
            response.raise_for_status()
            data: dict[str, Any] = response.json()
            for item in data.get("values", []):
                item_type = item.get("type", "")
                item_path = item.get("path", "")
                if item_type == "commit_file":
                    paths.append(item_path)
                elif item_type == "commit_directory":
                    # Recurse into subdirectories
                    sub = await self.list_directory(repo_path, item_path, ref)
                    paths.extend(sub)
            next_url = data.get("next")
        return paths

    async def get_commits(
        self, repo_path: str, file_path: str, ref: str = "HEAD", limit: int = 10
    ) -> list[dict[str, str]]:
        workspace, repo_slug = _split_repo_path(repo_path)
        url = f"{self._api_url}/repositories/{workspace}/{repo_slug}/commits/{ref}"
        # The first page already holds the newest ``limit`` commits; following ``next`` would walk the whole history.
        items = await self._get_paginated(url, params={"path": file_path, "pagelen": limit}, max_pages=1)
        result: list[dict[str, str]] = []
        for item in items[:limit]:
            author_raw: dict[str, Any] = item.get("author", {})
            author_name = str(author_raw.get("raw", "")).split("<")[0].strip() or str(
                author_raw.get("user", {}).get("display_name", "")
            )
            date_str = str(item.get("date", ""))
            message = str(item.get("message", "")).split("\n")[0]
            result.append(
                {
                    "id": str(item.get("hash", ""))[:8],
                    "title": message,
                    "author": author_name,
                    "date": date_str,
                }
            )
        return result


def _bbql_string(value: str) -> str:
    """Quote a value for Bitbucket's query language."""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def _item_to_repo(item: dict[str, Any]) -> Repo:
    return Repo(
        id=str(item.get("uuid", item.get("slug", ""))),
        path=str(item["full_name"]),
        name=str(item["slug"]),
        description=item.get("description") or None,
    )


def _pr_repo_path(item: dict[str, Any]) -> str:
    repository: dict[str, Any] = (item.get("destination") or {}).get("repository") or {}
    return str(repository.get("full_name", ""))


def _status(bb_state: str) -> Literal["opened", "merged", "closed"]:
    if bb_state == "MERGED":
        return "merged"
    if bb_state == "OPEN":
        return "opened"
    return "closed"


def _pr_to_mr(
    item: dict[str, Any],
    *,
    additions: int | None = None,
    deletions: int | None = None,
    file_count: int | None = None,
) -> MR:
    """Map a pull request; Bitbucket only reports diff stats through the separate diffstat endpoint."""
    status = _status(str(item.get("state", "DECLINED")))

    source: dict[str, Any] = item.get("source", {})
    destination: dict[str, Any] = item.get("destination", {})
    source_branch = str(source.get("branch", {}).get("name", ""))
    source_commit: dict[str, Any] = source.get("commit") or {}
    target_branch = str(destination.get("branch", {}).get("name", ""))
    author_data: dict[str, Any] = item.get("author", {})
    author = str(author_data.get("username", author_data.get("display_name", "")))

    title = str(item.get("title", ""))
    is_draft = title.lower().startswith("[wip]") or title.lower().startswith("wip:")

    return MR(
        iid=int(item["id"]),
        title=title,
        description=str(item.get("description", "") or ""),
        author=author,
        source_branch=source_branch,
        target_branch=target_branch,
        status=status,
        draft=is_draft,
        pipeline=None,
        additions=additions,
        deletions=deletions,
        file_count=file_count,
        web_url=str(item.get("links", {}).get("html", {}).get("href", "")),
        created_at=_parse_datetime(str(item["created_on"])),
        updated_at=_parse_datetime(str(item["updated_on"])),
        head_sha=str(source_commit["hash"]) if source_commit.get("hash") else None,
    )
