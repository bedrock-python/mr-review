from __future__ import annotations

import asyncio
from typing import Any, Literal
from urllib.parse import quote

import httpx

from mr_review.core.mrs.entities import MR, DiffFile, InboxMR, MRStateFilter, PersonalMRScope, Repo
from mr_review.core.pagination import DEFAULT_MRS_PER_PAGE, DEFAULT_REPOS_PER_PAGE, Page
from mr_review.infra.vcs._diff_parser import diff_file_from_patch
from mr_review.infra.vcs._diff_parser import parse_datetime as _parse_datetime
from mr_review.infra.vcs._pagination import gitlab_has_more, json_list, optional_int, optional_str

# /merge_requests/:iid/diffs is paginated; 100 pages of 100 files is far beyond what GitLab
# itself renders, and keeps a pathological MR from looping forever.
_DIFF_PAGE_SIZE = 100
_MAX_DIFF_PAGES = 100

_PERSONAL_SCOPES: dict[PersonalMRScope, str] = {
    "authored": "created_by_me",
    "assigned": "assigned_to_me",
}


def _encode_path(repo_path: str) -> str:
    return quote(repo_path, safe="")


def _pipeline_status(mr_data: dict[str, Any]) -> str | None:
    if "head_pipeline" not in mr_data:
        # List endpoints don't include the pipeline at all: unknown, not "no pipeline".
        return None
    pipeline = mr_data["head_pipeline"]
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
        # Resolved once per provider (the provider lives as long as the host's URL/token don't change).
        self._username: str | None = None
        self._username_lock = asyncio.Lock()

    async def _get_response(self, path: str, params: dict[str, Any] | None = None) -> httpx.Response:
        url = f"{self._base_url}/api/v4{path}"
        response = await self._client.get(url, headers=self._headers, params=params)
        response.raise_for_status()
        return response

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return (await self._get_response(path, params)).json()

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

    async def list_repos(
        self, query: str | None = None, page: int = 1, per_page: int = DEFAULT_REPOS_PER_PAGE
    ) -> Page[Repo]:
        params: dict[str, Any] = {
            "membership": "true",
            "simple": "true",
            "order_by": "last_activity_at",
            "sort": "desc",
            "per_page": per_page,
            "page": page,
        }
        if query:
            params["search"] = query
        response = await self._get_response("/projects", params=params)
        items = json_list(response)
        return Page(
            items=[_item_to_repo(item) for item in items],
            page=page,
            per_page=per_page,
            has_more=gitlab_has_more(response, len(items), per_page),
        )

    async def get_repo(self, repo_path: str) -> Repo:
        encoded = _encode_path(repo_path)
        data: dict[str, Any] = await self._get(f"/projects/{encoded}")
        return _item_to_repo(data)

    async def list_mrs(
        self,
        repo_path: str,
        state: MRStateFilter = "opened",
        page: int = 1,
        per_page: int = DEFAULT_MRS_PER_PAGE,
        query: str | None = None,
    ) -> Page[MR]:
        encoded = _encode_path(repo_path)
        params: dict[str, Any] = {
            "state": state,
            "order_by": "updated_at",
            "sort": "desc",
            "per_page": per_page,
            "page": page,
            "with_merge_status_recheck": "false",
        }
        if query:
            params["search"] = query
            params["in"] = "title"
        response = await self._get_response(f"/projects/{encoded}/merge_requests", params=params)
        items = json_list(response)
        return Page(
            items=[_item_to_mr(item) for item in items],
            page=page,
            per_page=per_page,
            has_more=gitlab_has_more(response, len(items), per_page),
        )

    async def list_my_mrs(
        self, scope: PersonalMRScope, page: int = 1, per_page: int = DEFAULT_MRS_PER_PAGE
    ) -> Page[InboxMR]:
        params: dict[str, Any] = {
            "state": "opened",
            "order_by": "updated_at",
            "sort": "desc",
            "per_page": per_page,
            "page": page,
        }
        if scope == "review_requested":
            params["scope"] = "all"
            params["reviewer_username"] = await self._current_username()
        else:
            params["scope"] = _PERSONAL_SCOPES[scope]
        response = await self._get_response("/merge_requests", params=params)
        items = json_list(response)
        return Page(
            items=[InboxMR(mr=_item_to_mr(item), repo_path=_repo_path_of(item)) for item in items],
            page=page,
            per_page=per_page,
            has_more=gitlab_has_more(response, len(items), per_page),
        )

    async def _current_username(self) -> str:
        if self._username is None:
            async with self._username_lock:
                if self._username is None:
                    data: dict[str, Any] = await self._get("/user")
                    self._username = str(data["username"])
        return self._username

    async def get_mr(self, repo_path: str, mr_iid: int) -> MR:
        encoded = _encode_path(repo_path)
        item: dict[str, Any] = await self._get(f"/projects/{encoded}/merge_requests/{mr_iid}")
        return _item_to_mr(item)

    async def get_diff(self, repo_path: str, mr_iid: int) -> list[DiffFile]:
        encoded = _encode_path(repo_path)
        try:
            changes = await self._list_mr_diffs(encoded, mr_iid)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code != httpx.codes.NOT_FOUND:
                raise
            # GitLab < 15.7 has no /diffs; /changes is deprecated (and truncates large MRs) but still there.
            data: dict[str, Any] = await self._get(f"/projects/{encoded}/merge_requests/{mr_iid}/changes")
            changes = data.get("changes", [])
        return [_change_to_diff_file(change) for change in changes]

    async def _list_mr_diffs(self, encoded: str, mr_iid: int) -> list[dict[str, Any]]:
        changes: list[dict[str, Any]] = []
        for page in range(1, _MAX_DIFF_PAGES + 1):
            response = await self._get_response(
                f"/projects/{encoded}/merge_requests/{mr_iid}/diffs",
                params={"page": page, "per_page": _DIFF_PAGE_SIZE},
            )
            items = json_list(response)
            changes.extend(items)
            if not gitlab_has_more(response, len(items), _DIFF_PAGE_SIZE):
                break
        return changes

    async def get_branch_diff(self, repo_path: str, base_ref: str, head_ref: str) -> list[DiffFile]:
        encoded = _encode_path(repo_path)
        data: dict[str, Any] = await self._get(
            f"/projects/{encoded}/repository/compare",
            params={"from": base_ref, "to": head_ref, "straight": "false"},
        )
        return [_change_to_diff_file(change) for change in data.get("diffs", [])]

    async def get_diff_refs(self, repo_path: str, mr_iid: int) -> dict[str, str]:
        encoded = _encode_path(repo_path)
        # The MR itself carries diff_refs; /changes would download the whole diff just for them.
        data: dict[str, Any] = await self._get(f"/projects/{encoded}/merge_requests/{mr_iid}")
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


def _map_mr_state(state: str) -> Literal["opened", "merged", "closed"]:
    if state == "opened":
        return "opened"
    if state == "merged":
        return "merged"
    return "closed"


def _item_to_repo(item: dict[str, Any]) -> Repo:
    return Repo(
        id=str(item["id"]),
        path=str(item["path_with_namespace"]),
        name=str(item["name"]),
        description=item.get("description"),
    )


def _item_to_mr(item: dict[str, Any]) -> MR:
    """Map a merge request. GitLab never reports line stats; ``changes_count`` is on the single-MR view only."""
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
        file_count=optional_int(item.get("changes_count")),
        web_url=str(item.get("web_url", "")),
        created_at=_parse_datetime(str(item["created_at"])),
        updated_at=_parse_datetime(str(item["updated_at"])),
        head_sha=optional_str(item.get("sha") or (item.get("diff_refs") or {}).get("head_sha")),
    )


def _change_to_diff_file(change: dict[str, Any]) -> DiffFile:
    return diff_file_from_patch(str(change["new_path"]), change.get("old_path"), str(change.get("diff") or ""))


def _repo_path_of(item: dict[str, Any]) -> str:
    """Project path of an MR from the instance-wide listing (``references.full`` is ``group/project!iid``)."""
    full = str((item.get("references") or {}).get("full") or "")
    if "!" in full:
        return full.rsplit("!", 1)[0]
    # Older GitLab: derive it from the web URL, https://host/<group>/<project>/-/merge_requests/<iid>.
    project_url = str(item.get("web_url", "")).split("/-/merge_requests/", 1)[0]
    return project_url.split("://", 1)[-1].split("/", 1)[-1]
