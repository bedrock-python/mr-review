from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal
from urllib.parse import quote

import httpx

from mr_review.core.mrs.entities import MR, DiffFile, InboxMR, MRStateFilter, PersonalMRScope, Repo
from mr_review.core.pagination import DEFAULT_MRS_PER_PAGE, DEFAULT_REPOS_PER_PAGE, Page
from mr_review.core.vcs.entities import InlineComment, PostedNote, PostFailure, PostResult
from mr_review.infra.vcs._diff_parser import parse_datetime as _parse_datetime
from mr_review.infra.vcs._diff_parser import parse_full_diff as _parse_full_diff
from mr_review.infra.vcs._diff_parser import parse_patch_to_hunks as _parse_patch_to_hunks
from mr_review.infra.vcs._pagination import (
    gitea_has_more,
    json_list,
    optional_int,
    optional_str,
)
from mr_review.infra.vcs._posting import (
    describe_http_error,
    describe_status_error,
    failure_from,
    match_review_comments,
)
from mr_review.infra.vcs._tree import files_under

# Gitea's own default and ceiling for tree pages; the cap keeps a giant monorepo from paging forever.
_TREE_PAGE_SIZE = 1000
GITEA_MAX_TREE_PAGES = 100

logger = logging.getLogger(__name__)

# Statuses that refuse a review without submitting it (validation); after a 5xx the post first
# checks whether the review was submitted anyway.
_REFUSED_REVIEW_STATUSES = frozenset({httpx.codes.BAD_REQUEST, httpx.codes.UNPROCESSABLE_ENTITY})
_REVIEW_PAGE_SIZE = 50
_MAX_REVIEW_PAGES = 20
_PENDING_REVIEW_REASON = (
    "you have a pending review on this pull request in Gitea; submit or discard it there first, "
    "posting would publish it along with these comments"
)
_LEFT_PENDING_REASON = (
    "Gitea refused the review and left part of it pending, which could not be cleared; discard your "
    "pending review on the pull request in Gitea, then retry"
)


class _UnattributableError(Exception):
    """The token's user is unknown, so a review cannot be told apart from somebody else's."""


@dataclass
class _ReviewTarget:
    owner: str
    repo: str
    mr_iid: int
    commit_id: str
    login: str | None
    # Reviews that existed when the post started, and the ones it created itself.
    known_ids: set[object] = field(default_factory=set)
    has_pending_review: bool = False

    @property
    def reviews_path(self) -> str:
        return f"/repos/{self.owner}/{self.repo}/pulls/{self.mr_iid}/reviews"

    def is_own_pending(self, review: dict[str, Any]) -> bool:
        """Gitea lists a pending review only to its author (and admins); without a login any counts."""
        author = (review.get("user") or {}).get("login")
        return review.get("state") == "PENDING" and (self.login is None or author == self.login)


# The pulls API filters by open/closed only; merged vs. closed is told apart per item.
_UPSTREAM_STATE: dict[MRStateFilter, str] = {
    "opened": "open",
    "merged": "closed",
    "closed": "closed",
    "all": "all",
}

_PERSONAL_SCOPE_PARAMS: dict[PersonalMRScope, str] = {
    "authored": "created",
    "assigned": "assigned",
    "review_requested": "review_requested",
}


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
        # Resolved once per provider (the provider lives as long as the host's URL/token don't change).
        self._user_id: int | None = None
        self._user_lock = asyncio.Lock()
        self._login: str | None = None

    async def _get_response(self, path: str, params: dict[str, Any] | None = None) -> httpx.Response:
        url = f"{self._base_url}/api/v1{path}"
        response = await self._client.get(url, headers=self._headers, params=params)
        response.raise_for_status()
        return response

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return (await self._get_response(path, params)).json()

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

    async def list_repos(
        self, query: str | None = None, page: int = 1, per_page: int = DEFAULT_REPOS_PER_PAGE
    ) -> Page[Repo]:
        # Without uid, /repos/search lists every repository the instance shows the token — on a
        # public instance like Codeberg, all of it. uid keeps it to repos the user owns or contributes to.
        params: dict[str, Any] = {
            "uid": await self._current_user_id(),
            "sort": "updated",
            "order": "desc",
            "limit": per_page,
            "page": page,
        }
        if query:
            params["q"] = query
        response = await self._get_response("/repos/search", params=params)
        data: Any = response.json()
        items: list[dict[str, Any]] = (data.get("data") or []) if isinstance(data, dict) else []
        return Page(
            items=[_item_to_repo(item) for item in items],
            page=page,
            per_page=per_page,
            has_more=gitea_has_more(response, len(items), per_page),
        )

    async def _current_user_id(self) -> int:
        if self._user_id is None:
            async with self._user_lock:
                if self._user_id is None:
                    user: dict[str, Any] = await self._get("/user")
                    self._user_id = int(user["id"])
        return self._user_id

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
        """One upstream page of pull requests.

        A search goes through Gitea's issue search (``/issues?type=pulls&q=``), which matches titles,
        bodies and comments host-side and returns issue-shaped items (no branches, no stats). Neither
        endpoint can tell merged from closed, so that split is made on the fetched page: such a page
        can hold fewer than ``per_page`` items while ``has_more`` is true.
        """
        owner, repo = _split_repo_path(repo_path)
        if query:
            response = await self._get_response(
                f"/repos/{owner}/{repo}/issues",
                params={"type": "pulls", "q": query, "state": _UPSTREAM_STATE[state], "page": page, "limit": per_page},
            )
            raw = json_list(response)
            mrs = [_issue_to_mr(item) for item in raw]
        else:
            response = await self._get_response(
                f"/repos/{owner}/{repo}/pulls",
                params={"state": _UPSTREAM_STATE[state], "sort": "recentupdate", "limit": per_page, "page": page},
            )
            raw = json_list(response)
            mrs = [_pr_to_mr(item) for item in raw]
        if state in ("merged", "closed"):
            mrs = [mr for mr in mrs if mr.status == state]
        return Page(items=mrs, page=page, per_page=per_page, has_more=gitea_has_more(response, len(raw), per_page))

    async def list_my_mrs(
        self, scope: PersonalMRScope, page: int = 1, per_page: int = DEFAULT_MRS_PER_PAGE
    ) -> Page[InboxMR]:
        response = await self._get_response(
            "/repos/issues/search",
            params={
                "type": "pulls",
                "state": "open",
                _PERSONAL_SCOPE_PARAMS[scope]: "true",
                "limit": per_page,
                "page": page,
            },
        )
        raw = json_list(response)
        return Page(
            items=[
                InboxMR(mr=_issue_to_mr(item), repo_path=str((item.get("repository") or {}).get("full_name", "")))
                for item in raw
            ],
            page=page,
            per_page=per_page,
            has_more=gitea_has_more(response, len(raw), per_page),
        )

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

    async def get_branch_diff(self, repo_path: str, base_ref: str, head_ref: str) -> list[DiffFile]:
        owner, repo = _split_repo_path(repo_path)
        # Gitea exposes branch comparison as a unified diff at
        # /repos/{owner}/{repo}/compare/{base}...{head}.diff
        encoded_base = quote(base_ref, safe="")
        encoded_head = quote(head_ref, safe="")
        url = f"{self._base_url}/api/v1/repos/{owner}/{repo}/compare/{encoded_base}...{encoded_head}.diff"
        response = await self._client.get(url, headers=self._headers)
        if response.status_code == 404:
            return []
        response.raise_for_status()
        return _parse_full_diff(response.text)

    async def get_diff_refs(self, repo_path: str, mr_iid: int) -> dict[str, str]:
        owner, repo = _split_repo_path(repo_path)
        data: dict[str, Any] = await self._get(f"/repos/{owner}/{repo}/pulls/{mr_iid}")
        head_sha = str(data.get("head", {}).get("sha", ""))
        return {"head_sha": head_sha}

    async def post_inline_comments(
        self,
        repo_path: str,
        mr_iid: int,
        diff_refs: dict[str, str],
        comments: Sequence[InlineComment],
    ) -> AsyncIterator[PostResult]:
        """All comments as one review (``event: COMMENT``), so they appear at once.

        Gitea adds the comments to the user's pending review one by one and submits it at the end.
        A comment that fails stops the request and leaves the earlier ones pending, where the next
        submission would publish them; Gitea can also fail after it submitted the review. So after a
        refused review the post first works out whether the review went out, clears whatever was
        left pending, and only then posts the comments one per review to find the refused one.
        """
        if not comments:
            return
        owner, repo = _split_repo_path(repo_path)
        try:
            target = await self._review_target(owner, repo, mr_iid, diff_refs.get("head_sha", ""))
        except httpx.HTTPError as exc:
            reason = f"could not check for a pending review of yours: {describe_http_error(exc)}"
            for _ in comments:
                yield PostFailure(reason=reason)
            return
        if target.has_pending_review:
            # Posting would publish the user's own pending review along with these comments.
            for _ in comments:
                yield PostFailure(reason=_PENDING_REVIEW_REASON, kind="blocked")
            return
        for result in await self._post_as_review(target, comments):
            yield result

    async def _review_target(self, owner: str, repo: str, mr_iid: int, commit_id: str) -> _ReviewTarget:
        target = _ReviewTarget(
            owner=owner, repo=repo, mr_iid=mr_iid, commit_id=commit_id, login=await self._current_login()
        )
        reviews = await self._list_reviews(target)
        target.known_ids.update(review.get("id") for review in reviews)
        target.has_pending_review = any(target.is_own_pending(review) for review in reviews)
        return target

    async def _post_as_review(self, target: _ReviewTarget, comments: Sequence[InlineComment]) -> list[PostResult]:
        try:
            review: dict[str, Any] = await self._post(
                target.reviews_path,
                {
                    "commit_id": target.commit_id,
                    "body": "",
                    "event": "COMMENT",
                    # new_position is the line in the new file (an unchanged line too); old_position
                    # would win over it, so it is left out.
                    "comments": [
                        {"path": c.anchor.path, "new_position": c.anchor.new_line, "body": c.body} for c in comments
                    ],
                },
            )
        except httpx.HTTPError as exc:
            return await self._after_failed_review(exc, target, comments)
        target.known_ids.add(review.get("id"))
        return list(await self._review_notes(target, review, comments))

    async def _after_failed_review(
        self, exc: httpx.HTTPError, target: _ReviewTarget, comments: Sequence[InlineComment]
    ) -> list[PostResult]:
        """What a review Gitea did not confirm amounts to, and the comments posted one by one if safe."""
        if not isinstance(exc, httpx.HTTPStatusError):
            # A timeout or a dropped connection: Gitea may still be adding the comments.
            return [failure_from(exc) for _ in comments]
        status = exc.response.status_code
        if status < httpx.codes.INTERNAL_SERVER_ERROR and status not in _REFUSED_REVIEW_STATUSES:
            return [failure_from(exc) for _ in comments]
        if status >= httpx.codes.INTERNAL_SERVER_ERROR:
            settled = await self._submitted_anyway(exc, target, comments)
            if settled is not None:
                return settled
        return await self._post_one_by_one(exc, target, comments)

    async def _submitted_anyway(
        self, exc: httpx.HTTPStatusError, target: _ReviewTarget, comments: Sequence[InlineComment]
    ) -> list[PostResult] | None:
        """After a 5xx Gitea is done with the request, but may have submitted the review before failing.

        The comments of that review when it did, ambiguous failures when that cannot be told, and
        ``None`` when nothing went out.
        """
        try:
            submitted = await self._new_submitted_review(target)
        except (httpx.HTTPError, _UnattributableError):
            return [failure_from(exc) for _ in comments]
        if submitted is None:
            return None
        target.known_ids.add(submitted.get("id"))
        return list(await self._review_notes(target, submitted, comments))

    async def _post_one_by_one(
        self, exc: httpx.HTTPStatusError, target: _ReviewTarget, comments: Sequence[InlineComment]
    ) -> list[PostResult]:
        """Nothing went out: clear what the request left pending, then find the comment Gitea refused."""
        if not await self._discard_pending_review(target):
            return [PostFailure(reason=_LEFT_PENDING_REASON, kind="blocked") for _ in comments]
        if len(comments) > 1:
            return [result for comment in comments for result in await self._post_as_review(target, [comment])]
        if exc.response.status_code >= httpx.codes.INTERNAL_SERVER_ERROR:
            reason = f"Gitea could not add it to its line ({describe_status_error(exc)}); nothing was posted"
            return [PostFailure(reason=reason, kind="position_rejected")]
        return [failure_from(exc)]

    async def _new_submitted_review(self, target: _ReviewTarget) -> dict[str, Any] | None:
        """A review by the token's user, at this commit, that this post created; ``None`` if there is none."""
        if target.login is None:
            raise _UnattributableError
        for review in await self._list_reviews(target):
            if (
                review.get("id") not in target.known_ids
                and review.get("state") != "PENDING"
                and (review.get("user") or {}).get("login") == target.login
                and (not target.commit_id or review.get("commit_id") == target.commit_id)
            ):
                return review
        return None

    async def _list_reviews(self, target: _ReviewTarget) -> list[dict[str, Any]]:
        reviews: list[dict[str, Any]] = []
        for page in range(1, _MAX_REVIEW_PAGES + 1):
            batch: list[dict[str, Any]] = await self._get(
                target.reviews_path, params={"page": page, "limit": _REVIEW_PAGE_SIZE}
            )
            reviews.extend(batch)
            if len(batch) < _REVIEW_PAGE_SIZE:
                break
        return reviews

    async def _review_notes(
        self, target: _ReviewTarget, review: dict[str, Any], comments: Sequence[InlineComment]
    ) -> list[PostedNote]:
        """The id and link of every comment the review created; the review's own where they can't be listed."""
        review_note = PostedNote(note_id=str(review["id"]), url=optional_str(review.get("html_url")))
        try:
            created: list[dict[str, Any]] = await self._get(f"{target.reviews_path}/{review['id']}/comments")
        except httpx.HTTPError:
            # The review is posted; only the links to its single comments are missing.
            logger.warning("Could not list the comments of Gitea review %s", review["id"], exc_info=True)
            created = []
        return match_review_comments(comments, created, review_note)

    async def _discard_pending_review(self, target: _ReviewTarget) -> bool:
        """Delete what a refused review left pending; ``False`` when that could not be done safely."""
        if target.login is None:
            # Without knowing whose review it is, an admin's token could delete someone else's.
            return False
        try:
            pending = next((r for r in await self._list_reviews(target) if target.is_own_pending(r)), None)
            if pending is not None:
                url = f"{self._base_url}/api/v1{target.reviews_path}/{pending['id']}"
                response = await self._client.delete(url, headers=self._headers)
                response.raise_for_status()
        except httpx.HTTPError:
            logger.warning("Could not clear the pending Gitea review on %s", target.reviews_path, exc_info=True)
            return False
        return True

    async def _current_login(self) -> str | None:
        """The token user's login; ``None`` when the token may not read it (no ``read:user`` scope)."""
        if self._login is None:
            try:
                data: dict[str, Any] = await self._get("/user")
            except httpx.HTTPError:
                logger.warning("Could not read the Gitea user of this token", exc_info=True)
                return None
            self._login = str(data.get("login", ""))
        return self._login

    async def post_general_note(self, repo_path: str, mr_iid: int, body: str) -> PostResult:
        owner, repo = _split_repo_path(repo_path)
        try:
            data: dict[str, Any] = await self._post(f"/repos/{owner}/{repo}/issues/{mr_iid}/comments", {"body": body})
        except httpx.HTTPError as exc:
            return failure_from(exc)
        return PostedNote(note_id=str(data["id"]), url=optional_str(data.get("html_url")))

    async def get_file(self, repo_path: str, file_path: str, ref: str = "HEAD") -> str | None:
        owner, repo = _split_repo_path(repo_path)
        url = f"{self._base_url}/api/v1/repos/{owner}/{repo}/raw/{file_path}"
        response = await self._client.get(url, headers=self._headers, params={"ref": ref})
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.text

    async def list_directory(self, repo_path: str, dir_path: str, ref: str = "HEAD") -> list[str]:
        return files_under(await self.list_tree(repo_path, ref), dir_path)

    async def list_tree(self, repo_path: str, ref: str = "HEAD") -> list[str]:
        """Every file path at ``ref``. Gitea pages recursive trees and flags more pages with ``truncated``."""
        owner, repo = _split_repo_path(repo_path)
        url = f"{self._base_url}/api/v1/repos/{owner}/{repo}/git/trees/{ref}"
        paths: list[str] = []
        for page in range(1, GITEA_MAX_TREE_PAGES + 1):
            response = await self._client.get(
                url,
                headers=self._headers,
                params={"recursive": "true", "page": page, "per_page": _TREE_PAGE_SIZE},
            )
            if response.status_code == httpx.codes.NOT_FOUND:
                return []
            response.raise_for_status()
            data: dict[str, Any] = response.json()
            paths.extend(str(item["path"]) for item in data.get("tree", []) if item.get("type") == "blob")
            if not data.get("truncated"):
                return paths
        logger.warning("Gitea tree for %s@%s exceeds %d pages; listing the first ones", repo_path, ref, page)
        return paths

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


def _status(state: str, merged: object) -> Literal["opened", "merged", "closed"]:
    if merged:
        return "merged"
    return "opened" if state == "open" else "closed"


def _item_to_repo(item: dict[str, Any]) -> Repo:
    return Repo(
        id=str(item["id"]),
        path=str(item["full_name"]),
        name=str(item["name"]),
        description=item.get("description") or None,
    )


def _pr_to_mr(item: dict[str, Any]) -> MR:
    """Map a pull request object. Older Gitea releases don't report diff stats at all."""
    head: dict[str, Any] = item.get("head", {})
    base: dict[str, Any] = item.get("base", {})
    return MR(
        iid=int(item["number"]),
        title=str(item["title"]),
        description=str(item.get("body") or ""),
        author=str(item["user"]["login"]),
        source_branch=str(head.get("label", head.get("ref", ""))),
        target_branch=str(base.get("label", base.get("ref", ""))),
        status=_status(str(item.get("state", "closed")), item.get("merged", False)),
        draft=bool(item.get("draft", False)),
        pipeline=None,
        additions=optional_int(item.get("additions")),
        deletions=optional_int(item.get("deletions")),
        file_count=optional_int(item.get("changed_files")),
        web_url=str(item.get("html_url", "")),
        created_at=_parse_datetime(str(item["created_at"])),
        updated_at=_parse_datetime(str(item["updated_at"])),
        head_sha=optional_str(head.get("sha")),
    )


def _issue_to_mr(item: dict[str, Any]) -> MR:
    """Map an issue-search hit for a pull request: no branch names and no diff stats in this view."""
    pull: dict[str, Any] = item.get("pull_request") or {}
    return MR(
        iid=int(item["number"]),
        title=str(item["title"]),
        description=str(item.get("body") or ""),
        author=str(item["user"]["login"]),
        source_branch="",
        target_branch="",
        status=_status(str(item.get("state", "closed")), pull.get("merged", False)),
        draft=bool(pull.get("draft", False)),
        pipeline=None,
        web_url=str(pull.get("html_url") or item.get("html_url", "")),
        created_at=_parse_datetime(str(item["created_at"])),
        updated_at=_parse_datetime(str(item["updated_at"])),
    )


def _encode_path(repo_path: str) -> str:
    return quote(repo_path, safe="")
