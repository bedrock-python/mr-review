from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx

from mr_review.core.mrs.entities import MR, DiffFile, Repo
from mr_review.infra.vcs._diff_parser import parse_patch_to_hunks as _parse_diff_text

_BITBUCKET_API = "https://api.bitbucket.org/2.0"


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

    async def list_repos(self, query: str | None = None) -> list[Repo]:
        workspace = self._username
        if not workspace:
            return []
        url = f"{self._api_url}/repositories/{workspace}"
        params: dict[str, Any] = {"sort": "-updated_on", "pagelen": 100}
        if query:
            params["q"] = f'name ~ "{query}"'
        items = await self._get_paginated(url, params=params)
        return [
            Repo(
                id=str(item.get("uuid", item.get("slug", ""))),
                path=str(item["full_name"]),
                name=str(item["slug"]),
                description=item.get("description") or None,
            )
            for item in items
        ]

    async def get_repo(self, repo_path: str) -> Repo:
        workspace, repo_slug = _split_repo_path(repo_path)
        data: dict[str, Any] = await self._get(f"/repositories/{workspace}/{repo_slug}")
        return Repo(
            id=str(data.get("uuid", data.get("slug", ""))),
            path=str(data["full_name"]),
            name=str(data["slug"]),
            description=data.get("description") or None,
        )

    async def list_mrs(self, repo_path: str, state: str = "opened") -> list[MR]:
        workspace, repo_slug = _split_repo_path(repo_path)
        bb_state = _map_state_to_bb(state)
        url = f"{self._api_url}/repositories/{workspace}/{repo_slug}/pullrequests"
        items = await self._get_paginated(url, params={"state": bb_state, "pagelen": 50})
        return [_pr_to_mr(item) for item in items]

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
        items = await self._get_paginated(url, params={"path": file_path, "pagelen": limit})
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


_FILE_HEADER_RE = re.compile(r"^diff --git a/(.+) b/(.+)$")
_OLD_FILE_RE = re.compile(r"^--- a/(.+)$")
_NEW_FILE_RE = re.compile(r"^\+\+\+ b/(.+)$")


def _build_diff_file(path: str, old_path: str | None, diff_lines: list[str]) -> DiffFile:
    diff_text = "\n".join(diff_lines)
    hunks = _parse_diff_text(diff_text)
    additions = sum(1 for ln in diff_lines if ln.startswith("+") and not ln.startswith("+++"))
    deletions = sum(1 for ln in diff_lines if ln.startswith("-") and not ln.startswith("---"))
    return DiffFile(
        path=path,
        old_path=old_path if old_path and old_path != path else None,
        additions=additions,
        deletions=deletions,
        hunks=hunks,
    )


@dataclass
class _DiffState:
    diff_files: list[DiffFile] = field(default_factory=list)
    current_path: str | None = None
    current_old_path: str | None = None
    current_diff: list[str] = field(default_factory=list)
    old_path: str | None = None
    new_path: str | None = None

    def flush(self) -> None:
        if self.current_path is not None:
            self.diff_files.append(_build_diff_file(self.current_path, self.current_old_path, self.current_diff))

    def handle_file_header(self, m: re.Match[str]) -> None:
        self.flush()
        self.current_path = None
        self.current_old_path = None
        self.current_diff = []
        self.old_path = m.group(1)
        self.new_path = m.group(2)


def _parse_full_diff(raw: str) -> list[DiffFile]:
    """Parse a full multi-file unified diff into DiffFile objects."""
    state = _DiffState()

    for line in raw.splitlines():
        m = _FILE_HEADER_RE.match(line)
        if m:
            state.handle_file_header(m)
            continue

        m2 = _OLD_FILE_RE.match(line)
        if m2 and state.old_path:
            state.current_old_path = m2.group(1) if m2.group(1) != "/dev/null" else None
            continue

        m3 = _NEW_FILE_RE.match(line)
        if m3 and state.new_path:
            state.current_path = m3.group(1) if m3.group(1) != "/dev/null" else state.old_path
            continue

        if state.current_path is not None:
            state.current_diff.append(line)

    state.flush()
    return state.diff_files


def _map_state_to_bb(state: str) -> str:
    mapping = {"opened": "OPEN", "merged": "MERGED", "closed": "DECLINED"}
    return mapping.get(state, "OPEN")


def _pr_to_mr(
    item: dict[str, Any],
    *,
    additions: int = 0,
    deletions: int = 0,
    file_count: int = 0,
) -> MR:
    bb_state = str(item.get("state", "DECLINED"))
    if bb_state == "MERGED":
        status = "merged"
    elif bb_state == "OPEN":
        status = "opened"
    else:
        status = "closed"

    source: dict[str, Any] = item.get("source", {})
    destination: dict[str, Any] = item.get("destination", {})
    source_branch = str(source.get("branch", {}).get("name", ""))
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
    )
