from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx

from mr_review.core.mrs.entities import MR, DiffFile, Repo
from mr_review.infra.vcs._diff_parser import parse_datetime as _parse_datetime
from mr_review.infra.vcs._diff_parser import parse_patch_to_hunks as _parse_diff_text


def _encode_path(repo_path: str) -> str:
    return quote(repo_path, safe="")


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

    async def list_repos(self, query: str | None = None) -> list[Repo]:
        repos: list[Repo] = []
        page = 1
        base_params: dict[str, Any] = {"membership": "true", "per_page": 100, "order_by": "last_activity_at"}
        if query:
            base_params["search"] = query
        while page <= 100:
            data: list[dict[str, Any]] = await self._get(
                "/projects",
                params={**base_params, "page": page},
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
        while page <= 100:
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

    async def get_branch_diff(self, repo_path: str, base_ref: str, head_ref: str) -> list[DiffFile]:
        encoded = _encode_path(repo_path)
        data: dict[str, Any] = await self._get(
            f"/projects/{encoded}/repository/compare",
            params={"from": base_ref, "to": head_ref, "straight": "false"},
        )
        diff_files: list[DiffFile] = []
        for change in data.get("diffs", []):
            diff_text: str = change.get("diff", "")
            hunks = _parse_diff_text(diff_text)
            additions = sum(
                1 for line in diff_text.splitlines() if line.startswith("+") and not line.startswith("+++")
            )
            deletions = sum(
                1 for line in diff_text.splitlines() if line.startswith("-") and not line.startswith("---")
            )
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

    async def get_diff_refs(self, repo_path: str, mr_iid: int) -> dict[str, str]:
        encoded = _encode_path(repo_path)
        data: dict[str, Any] = await self._get(f"/projects/{encoded}/merge_requests/{mr_iid}/changes")
        dr: dict[str, Any] = data.get("diff_refs") or {}
        return {
            "base_sha": str(dr.get("base_sha", "")),
            "start_sha": str(dr.get("start_sha", "")),
            "head_sha": str(dr.get("head_sha", "")),
        }

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

    async def get_file(self, repo_path: str, file_path: str, ref: str = "HEAD") -> str | None:
        encoded = _encode_path(repo_path)
        encoded_file = quote(file_path, safe="")
        url = f"{self._base_url}/api/v4/projects/{encoded}/repository/files/{encoded_file}/raw"
        response = await self._client.get(url, headers=self._headers, params={"ref": ref})
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.text

    async def get_commits(
        self, repo_path: str, file_path: str, ref: str = "HEAD", limit: int = 10
    ) -> list[dict[str, str]]:
        encoded = _encode_path(repo_path)
        data: list[dict[str, Any]] = await self._get(
            f"/projects/{encoded}/repository/commits",
            params={"path": file_path, "ref_name": ref, "per_page": limit},
        )
        return [
            {
                "id": str(item.get("short_id", "")),
                "title": str(item.get("title", "")),
                "author": str(item.get("author_name", "")),
                "date": str(item.get("created_at", "")),
            }
            for item in data
        ]

    async def list_directory(self, repo_path: str, dir_path: str, ref: str = "HEAD") -> list[str]:
        encoded = _encode_path(repo_path)
        page = 1
        paths: list[str] = []
        while page <= 100:
            url = f"{self._base_url}/api/v4/projects/{encoded}/repository/tree"
            response = await self._client.get(
                url,
                headers=self._headers,
                params={"path": dir_path, "recursive": "true", "ref": ref, "per_page": 100, "page": page},
            )
            if response.status_code == 404:
                return []
            response.raise_for_status()
            items: list[dict[str, Any]] = response.json()
            if not items:
                break
            paths.extend(item["path"] for item in items if item.get("type") == "blob")
            if len(items) < 100:
                break
            page += 1
        return paths


def _map_mr_state(state: str) -> str:
    mapping = {"opened": "opened", "merged": "merged", "closed": "closed"}
    return mapping.get(state, "closed")
