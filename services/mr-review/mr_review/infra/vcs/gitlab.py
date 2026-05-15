from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx

from mr_review.core.mrs.entities import MR, DiffFile, DiffHunk, DiffLine, Repo


def _parse_datetime(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _encode_path(repo_path: str) -> str:
    return quote(repo_path, safe="")


_HUNK_HEADER_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


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
    """Parse raw unified diff text into DiffHunk/DiffLine objects."""
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


def _pipeline_status(mr_data: dict[str, Any]) -> str | None:
    pipeline = mr_data.get("head_pipeline")
    if pipeline is None:
        return "none"
    status = pipeline.get("status", "")
    mapping: dict[str, str] = {
        "success": "passed",
        "failed": "failed",
        "running": "running",
        "pending": "running",
        "created": "running",
        "manual": "none",
        "canceled": "none",
        "skipped": "none",
    }
    return mapping.get(status, "none")


class GitLabProvider:
    def __init__(self, client: httpx.AsyncClient, base_url: str, token: str) -> None:
        self._client = client
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._headers = {"PRIVATE-TOKEN": token}

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        url = f"{self._base_url}/api/v4{path}"
        response = await self._client.get(url, headers=self._headers, params=params)
        response.raise_for_status()
        return response.json()

    async def _post(self, path: str, json_body: dict[str, Any]) -> Any:
        url = f"{self._base_url}/api/v4{path}"
        response = await self._client.post(url, headers=self._headers, json=json_body)
        response.raise_for_status()
        return response.json()

    async def test_connection(self) -> dict[str, str]:
        data: dict[str, Any] = await self._get("/user")
        return {
            "username": str(data.get("username", "")),
            "name": str(data.get("name", "")),
            "email": str(data.get("email", "")),
        }

    async def list_repos(self) -> list[Repo]:
        repos: list[Repo] = []
        page = 1
        while True:
            data: list[dict[str, Any]] = await self._get(
                "/projects",
                params={"membership": "true", "per_page": 100, "page": page, "order_by": "last_activity_at"},
            )
            if not data:
                break
            repos.extend(
                Repo(
                    id=str(item["id"]),
                    path=str(item["path_with_namespace"]),
                    name=str(item["name"]),
                    description=item.get("description"),
                )
                for item in data
            )
            if len(data) < 100:
                break
            page += 1
        return repos

    async def list_mrs(self, repo_path: str, state: str = "opened") -> list[MR]:
        encoded = _encode_path(repo_path)
        mrs: list[MR] = []
        page = 1
        while True:
            data: list[dict[str, Any]] = await self._get(
                f"/projects/{encoded}/merge_requests",
                params={"state": state, "per_page": 100, "page": page, "with_merge_status_recheck": "false"},
            )
            if not data:
                break
            for item in data:
                changes_count = int(str(item.get("changes_count") or 0).rstrip("+")) if item.get("changes_count") else 0
                mrs.append(
                    MR(
                        iid=int(item["iid"]),
                        title=str(item["title"]),
                        description=str(item.get("description") or ""),
                        author=str(item["author"]["username"]),
                        source_branch=str(item["source_branch"]),
                        target_branch=str(item["target_branch"]),
                        status=_map_mr_state(str(item["state"])),
                        draft=bool(item.get("draft", False) or item.get("work_in_progress", False)),
                        pipeline=_pipeline_status(item),
                        additions=int(item.get("additions", 0) or 0),
                        deletions=int(item.get("deletions", 0) or 0),
                        file_count=int(changes_count),
                        web_url=str(item.get("web_url", "")),
                        created_at=_parse_datetime(str(item["created_at"])),
                        updated_at=_parse_datetime(str(item["updated_at"])),
                    )
                )
            if len(data) < 100:
                break
            page += 1
        return mrs

    async def get_mr(self, repo_path: str, mr_iid: int) -> MR:
        encoded = _encode_path(repo_path)
        item: dict[str, Any] = await self._get(f"/projects/{encoded}/merge_requests/{mr_iid}")
        changes_count = int(str(item.get("changes_count") or 0).rstrip("+")) if item.get("changes_count") else 0
        return MR(
            iid=int(item["iid"]),
            title=str(item["title"]),
            description=str(item.get("description") or ""),
            author=str(item["author"]["username"]),
            source_branch=str(item["source_branch"]),
            target_branch=str(item["target_branch"]),
            status=_map_mr_state(str(item["state"])),
            draft=bool(item.get("draft", False) or item.get("work_in_progress", False)),
            pipeline=_pipeline_status(item),
            additions=int(item.get("additions", 0) or 0),
            deletions=int(item.get("deletions", 0) or 0),
            file_count=int(changes_count),
            web_url=str(item.get("web_url", "")),
            created_at=_parse_datetime(str(item["created_at"])),
            updated_at=_parse_datetime(str(item["updated_at"])),
        )

    async def get_diff(self, repo_path: str, mr_iid: int) -> list[DiffFile]:
        encoded = _encode_path(repo_path)
        data: dict[str, Any] = await self._get(
            f"/projects/{encoded}/merge_requests/{mr_iid}/changes",
        )
        diff_files: list[DiffFile] = []
        for change in data.get("changes", []):
            diff_text: str = change.get("diff", "")
            hunks = _parse_diff_text(diff_text)
            additions = sum(1 for line in diff_text.splitlines() if line.startswith("+") and not line.startswith("+++"))
            deletions = sum(1 for line in diff_text.splitlines() if line.startswith("-") and not line.startswith("---"))
            old_path = change.get("old_path")
            new_path = str(change["new_path"])
            diff_files.append(
                DiffFile(
                    path=new_path,
                    old_path=old_path if old_path != new_path else None,
                    additions=additions,
                    deletions=deletions,
                    hunks=hunks,
                )
            )
        return diff_files

    async def post_inline_comment(
        self,
        repo_path: str,
        mr_iid: int,
        diff_refs: dict[str, str],
        file: str,
        line: int,
        body: str,
    ) -> None:
        encoded = _encode_path(repo_path)
        payload: dict[str, Any] = {
            "body": body,
            "position": {
                "position_type": "text",
                "base_sha": diff_refs.get("base_sha", ""),
                "start_sha": diff_refs.get("start_sha", ""),
                "head_sha": diff_refs.get("head_sha", ""),
                "new_path": file,
                "new_line": line,
            },
        }
        await self._post(f"/projects/{encoded}/merge_requests/{mr_iid}/discussions", payload)

    async def post_general_note(self, repo_path: str, mr_iid: int, body: str) -> None:
        encoded = _encode_path(repo_path)
        await self._post(
            f"/projects/{encoded}/merge_requests/{mr_iid}/notes",
            {"body": body},
        )


def _map_mr_state(state: str) -> str:
    mapping = {"opened": "opened", "merged": "merged", "closed": "closed"}
    return mapping.get(state, "closed")
