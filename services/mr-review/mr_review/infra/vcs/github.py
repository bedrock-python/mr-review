from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import httpx

from mr_review.core.mrs.entities import MR, DiffFile, DiffHunk, DiffLine, Repo


def _parse_datetime(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _split_repo_path(repo_path: str) -> tuple[str, str]:
    """Split 'owner/repo' into (owner, repo)."""
    parts = repo_path.split("/", 1)
    if len(parts) != 2:
        raise ValueError(f"Invalid GitHub repo path: {repo_path!r}. Expected 'owner/repo'.")
    return parts[0], parts[1]


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


def _parse_patch_to_hunks(patch: str) -> list[DiffHunk]:
    """Parse GitHub patch string into DiffHunk objects."""
    hunks: list[DiffHunk] = []
    current_hunk: DiffHunk | None = None
    old_line = 0
    new_line = 0

    for raw_line in patch.splitlines():
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


class GitHubProvider:
    def __init__(self, client: httpx.AsyncClient, base_url: str, token: str) -> None:
        self._client = client
        self._base_url = base_url.rstrip("/") if base_url else "https://api.github.com"
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

    async def list_repos(self) -> list[Repo]:
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
        files: list[dict[str, Any]] = await self._get(
            f"/repos/{owner}/{repo}/pulls/{mr_iid}/files",
            params={"per_page": 100},
        )
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
