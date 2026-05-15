from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx

from mr_review.core.mrs.entities import MR, DiffFile, DiffHunk, DiffLine, Repo

_BITBUCKET_API = "https://api.bitbucket.org/2.0"

_HUNK_HEADER_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


def _parse_datetime(value: str) -> datetime:
    # Bitbucket uses ISO 8601 with +00:00 or Z
    value = value.replace("Z", "+00:00")
    # Strip microseconds beyond 6 digits if present
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


def _apply_diff_line(
    hunk: DiffHunk,
    raw_line: str,
    old_line: int,
    new_line: int,
) -> tuple[int, int]:
    if raw_line.startswith("+") and not raw_line.startswith("+++"):
        hunk.lines.append(DiffLine(type="added", new_line=new_line, content=raw_line[1:]))
        return old_line, new_line + 1
    if raw_line.startswith("-") and not raw_line.startswith("---"):
        hunk.lines.append(DiffLine(type="removed", old_line=old_line, content=raw_line[1:]))
        return old_line + 1, new_line
    content = raw_line[1:] if raw_line.startswith(" ") else raw_line
    hunk.lines.append(DiffLine(type="context", old_line=old_line, new_line=new_line, content=content))
    return old_line + 1, new_line + 1


def _parse_diff_text(diff_text: str) -> list[DiffHunk]:
    hunks: list[DiffHunk] = []
    current_hunk: DiffHunk | None = None
    old_line = 0
    new_line = 0

    for raw_line in diff_text.splitlines():
        m = _HUNK_HEADER_RE.match(raw_line)
        if m:
            if current_hunk is not None:
                hunks.append(current_hunk)
            old_start = int(m.group(1))
            new_start = int(m.group(3))
            current_hunk = DiffHunk(
                old_start=old_start,
                new_start=new_start,
                old_count=int(m.group(2)) if m.group(2) is not None else 1,
                new_count=int(m.group(4)) if m.group(4) is not None else 1,
                lines=[],
            )
            old_line, new_line = old_start, new_start
            continue

        if current_hunk is not None:
            old_line, new_line = _apply_diff_line(current_hunk, raw_line, old_line, new_line)

    if current_hunk is not None:
        hunks.append(current_hunk)

    return hunks


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

    async def _get_paginated(self, url: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """Follow Bitbucket's cursor-based pagination ('next' field)."""
        results: list[dict[str, Any]] = []
        next_url: str | None = url
        while next_url:
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

    async def list_repos(self) -> list[Repo]:
        # Use workspace from stored username; fall back to /repositories/
        workspace = self._username
        if not workspace:
            return []
        url = f"{self._api_url}/repositories/{workspace}"
        items = await self._get_paginated(url, params={"sort": "-updated_on", "pagelen": 100})
        return [
            Repo(
                id=str(item.get("uuid", item.get("slug", ""))),
                path=str(item["full_name"]),
                name=str(item["slug"]),
                description=item.get("description") or None,
            )
            for item in items
        ]

    async def list_mrs(self, repo_path: str, state: str = "opened") -> list[MR]:
        workspace, repo_slug = _split_repo_path(repo_path)
        bb_state = _map_state_to_bb(state)
        url = f"{self._api_url}/repositories/{workspace}/{repo_slug}/pullrequests"
        items = await self._get_paginated(url, params={"state": bb_state, "pagelen": 50})
        return [_pr_to_mr(item) for item in items]

    async def get_mr(self, repo_path: str, mr_iid: int) -> MR:
        workspace, repo_slug = _split_repo_path(repo_path)
        data: dict[str, Any] = await self._get(f"/repositories/{workspace}/{repo_slug}/pullrequests/{mr_iid}")
        return _pr_to_mr(data)

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


def _pr_to_mr(item: dict[str, Any]) -> MR:
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
        additions=0,
        deletions=0,
        file_count=0,
        web_url=str(item.get("links", {}).get("html", {}).get("href", "")),
        created_at=_parse_datetime(str(item["created_on"])),
        updated_at=_parse_datetime(str(item["updated_on"])),
    )
