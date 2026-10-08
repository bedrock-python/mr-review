"""What each VCS provider sends when posting comments, and how it reports per-comment outcomes."""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

import httpx
import pytest
from mr_review.core.vcs.entities import InlineComment, LineAnchor, PostedNote, PostFailure, PostResult
from mr_review.core.vcs.protocols import VCSProvider
from mr_review.infra.vcs.bitbucket import BitbucketProvider
from mr_review.infra.vcs.gitea import GiteaProvider
from mr_review.infra.vcs.github import GitHubProvider
from mr_review.infra.vcs.gitlab import GitLabProvider

from tests.factories.vcs_http import RoutedTransport, json_response

pytestmark = pytest.mark.unit

_REFS = {"base_sha": "base", "start_sha": "start", "head_sha": "head"}

_ADDED = InlineComment(anchor=LineAnchor(path="src/a.py", old_path="src/a.py", new_line=2), body="on an added line")
_CONTEXT = InlineComment(
    anchor=LineAnchor(path="src/a.py", old_path="src/a.py", new_line=3, old_line=2), body="on an unchanged line"
)
_RENAMED = InlineComment(anchor=LineAnchor(path="src/new.py", old_path="src/old.py", new_line=1), body="renamed")


def _body(request: httpx.Request) -> dict[str, Any]:
    payload: dict[str, Any] = json.loads(request.content)
    return payload


async def _collect(provider: VCSProvider, comments: Sequence[InlineComment], repo: str = "o/r") -> list[PostResult]:
    return [result async for result in provider.post_inline_comments(repo, 7, _REFS, comments)]


# ── GitLab ───────────────────────────────────────────────────────────────────

_GL_MR = "/api/v4/projects/group%2Frepo/merge_requests/7"


def _gitlab(transport: RoutedTransport) -> GitLabProvider:
    return GitLabProvider(client=transport.client(), base_url="https://gitlab.example.com", token="t")


async def test__gitlab__unchanged_line__position_names_both_sides() -> None:
    """Only ``new_line`` was sent, which GitLab rejects for an unchanged line: those fell back to notes."""
    counter = iter(range(100, 200))
    transport = RoutedTransport(
        {f"{_GL_MR}/discussions": lambda _r: json_response({"id": "d", "notes": [{"id": next(counter)}]})}
    )

    results = await _collect(_gitlab(transport), [_ADDED, _CONTEXT, _RENAMED], repo="group/repo")

    positions = [_body(r)["position"] for r in transport.requests]
    assert positions[0] == {
        "position_type": "text",
        "base_sha": "base",
        "start_sha": "start",
        "head_sha": "head",
        "old_path": "src/a.py",
        "new_path": "src/a.py",
        "new_line": 2,
    }
    assert (positions[1]["old_line"], positions[1]["new_line"]) == (2, 3)
    assert (positions[2]["old_path"], positions[2]["new_path"]) == ("src/old.py", "src/new.py")
    assert results[0] == PostedNote(
        note_id="100", url="https://gitlab.example.com/group/repo/-/merge_requests/7#note_100"
    )


async def test__gitlab__refused_position__fails_that_comment_only() -> None:
    def discussions(request: httpx.Request) -> httpx.Response:
        if _body(request)["body"] == _CONTEXT.body:
            return json_response({"message": {"line_code": ["can't be blank"]}}, status_code=400)
        return json_response({"id": "d", "notes": [{"id": 1}]})

    transport = RoutedTransport({f"{_GL_MR}/discussions": discussions})

    results = await _collect(_gitlab(transport), [_ADDED, _CONTEXT], repo="group/repo")

    assert isinstance(results[0], PostedNote)
    assert results[1] == PostFailure(
        reason="400 Bad Request: {'line_code': [\"can't be blank\"]}", kind="position_rejected"
    )


async def test__gitlab__general_note__returns_its_id_and_link() -> None:
    transport = RoutedTransport({f"{_GL_MR}/notes": json_response({"id": 42})})

    result = await _gitlab(transport).post_general_note("group/repo", 7, "hello")

    assert result == PostedNote(note_id="42", url="https://gitlab.example.com/group/repo/-/merge_requests/7#note_42")


# ── GitHub ───────────────────────────────────────────────────────────────────

_GH_PR = "/repos/o/r/pulls/7"


def _github(transport: RoutedTransport) -> GitHubProvider:
    return GitHubProvider(client=transport.client(), base_url="https://github.com", token="t")


async def test__github__posts_every_comment_as_one_review() -> None:
    created = [
        {"id": 11, "path": "src/a.py", "body": _ADDED.body, "html_url": "https://gh/c11"},
        {"id": 12, "path": "src/a.py", "body": _CONTEXT.body, "html_url": "https://gh/c12"},
    ]
    transport = RoutedTransport(
        {
            f"{_GH_PR}/reviews": json_response({"id": 5, "html_url": "https://gh/r5"}),
            f"{_GH_PR}/reviews/5/comments": json_response(created),
        }
    )

    results = await _collect(_github(transport), [_ADDED, _CONTEXT])

    review = _body(transport.requests[0])
    assert (review["event"], review["commit_id"]) == ("COMMENT", "head")
    assert review["body"]
    assert review["comments"] == [
        {"path": "src/a.py", "line": 2, "side": "RIGHT", "body": _ADDED.body},
        {"path": "src/a.py", "line": 3, "side": "RIGHT", "body": _CONTEXT.body},
    ]
    assert results == [PostedNote(note_id="11", url="https://gh/c11"), PostedNote(note_id="12", url="https://gh/c12")]


async def test__github__review_rejected_with_422__posts_one_by_one_and_isolates_the_bad_one() -> None:
    def single(request: httpx.Request) -> httpx.Response:
        payload = _body(request)
        if payload["line"] == 3:
            return json_response(
                {"message": "Validation Failed", "errors": ["line must be part of the diff"]}, status_code=422
            )
        return json_response({"id": 21, "html_url": "https://gh/c21"}, status_code=201)

    transport = RoutedTransport(
        {
            f"{_GH_PR}/reviews": json_response({"message": "Unprocessable Entity"}, status_code=422),
            f"{_GH_PR}/comments": single,
        }
    )

    results = await _collect(_github(transport), [_ADDED, _CONTEXT])

    assert results[0] == PostedNote(note_id="21", url="https://gh/c21")
    assert results[1] == PostFailure(
        reason="422 Unprocessable Entity: Validation Failed; line must be part of the diff", kind="position_rejected"
    )
    assert _body(transport.requests[1])["commit_id"] == "head"


async def test__github__review_fails_otherwise__fails_every_comment_without_retrying() -> None:
    transport = RoutedTransport({f"{_GH_PR}/reviews": json_response({"message": "Bad credentials"}, status_code=401)})

    results = await _collect(_github(transport), [_ADDED, _CONTEXT])

    assert results == [PostFailure(reason="401 Unauthorized: Bad credentials")] * 2
    assert transport.paths() == [f"{_GH_PR}/reviews"]


async def test__github__review_comments_unlisted__falls_back_to_the_review_link() -> None:
    transport = RoutedTransport({f"{_GH_PR}/reviews": json_response({"id": 5, "html_url": "https://gh/r5"})})

    results = await _collect(_github(transport), [_ADDED])

    assert results == [PostedNote(note_id="5", url="https://gh/r5")]


# ── Gitea / Forgejo ──────────────────────────────────────────────────────────

_GT_PR = "/api/v1/repos/o/r/pulls/7"


def _gitea(transport: RoutedTransport) -> GiteaProvider:
    return GiteaProvider(client=transport.client(), base_url="https://gitea.example.com", token="t")


def _gitea_routes(
    reviews: list[dict[str, Any]], create: httpx.Response, deleted: list[str] | None = None
) -> dict[str, Any]:
    def review_list_or_create(request: httpx.Request) -> httpx.Response:
        return json_response(reviews) if request.method == "GET" else create

    def delete(request: httpx.Request) -> httpx.Response:
        if deleted is not None:
            deleted.append(request.method)
        return httpx.Response(204)

    return {
        "/api/v1/user": json_response({"login": "me"}),
        f"{_GT_PR}/reviews": review_list_or_create,
        f"{_GT_PR}/reviews/9": delete,
    }


async def test__gitea__posts_every_comment_as_one_review_with_new_positions() -> None:
    """Every comment used to become a review of its own."""
    routes = _gitea_routes([], json_response({"id": 3, "html_url": "https://gt/r3"}))
    routes[f"{_GT_PR}/reviews/3/comments"] = json_response(
        [{"id": 31, "path": "src/a.py", "body": _CONTEXT.body, "html_url": "https://gt/c31"}]
    )
    transport = RoutedTransport(routes)

    results = await _collect(_gitea(transport), [_ADDED, _CONTEXT])

    creates = [r for r in transport.requests if r.method == "POST"]
    assert len(creates) == 1
    payload = _body(creates[0])
    assert (payload["event"], payload["commit_id"]) == ("COMMENT", "head")
    assert payload["comments"] == [
        {"path": "src/a.py", "new_position": 2, "body": _ADDED.body},
        {"path": "src/a.py", "new_position": 3, "body": _CONTEXT.body},
    ]
    assert results == [
        PostedNote(note_id="3", url="https://gt/r3"),
        PostedNote(note_id="31", url="https://gt/c31"),
    ]


async def test__gitea__users_own_pending_review__is_left_alone() -> None:
    pending = [{"id": 9, "state": "PENDING", "user": {"login": "me"}}]
    transport = RoutedTransport(_gitea_routes(pending, json_response({"id": 3})))

    results = await _collect(_gitea(transport), [_ADDED])

    assert [r.method for r in transport.requests if r.method != "GET"] == []
    assert isinstance(results[0], PostFailure)
    assert "pending review" in results[0].reason
    assert results[0].kind == "blocked"


async def test__gitea__rejected_review__clears_what_it_left_pending_then_posts_one_by_one() -> None:
    reviews: list[dict[str, Any]] = []
    deleted: list[str] = []
    calls = {"create": 0}

    def review_list_or_create(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return json_response(reviews)
        calls["create"] += 1
        if calls["create"] == 1:
            # The first comment was added, the second failed: the first one is left pending.
            reviews.append({"id": 9, "state": "PENDING", "user": {"login": "me"}})
            return json_response({"message": "CreateCodeComment: no such line"}, status_code=500)
        if _body(request)["comments"][0]["body"] == _CONTEXT.body:
            return json_response({"message": "no such line"}, status_code=500)
        return json_response({"id": 4, "html_url": "https://gt/r4"})

    def delete(request: httpx.Request) -> httpx.Response:
        deleted.append(request.method)
        reviews.clear()
        return httpx.Response(204)

    transport = RoutedTransport(
        {
            "/api/v1/user": json_response({"login": "me"}),
            f"{_GT_PR}/reviews": review_list_or_create,
            f"{_GT_PR}/reviews/9": delete,
            f"{_GT_PR}/reviews/4/comments": json_response([]),
        }
    )

    results = await _collect(_gitea(transport), [_ADDED, _CONTEXT])

    assert deleted == ["DELETE"]
    assert results[0] == PostedNote(note_id="4", url="https://gt/r4")
    assert results[1] == PostFailure(
        reason="Gitea could not add it to its line (500 Internal Server Error: no such line); nothing was posted",
        kind="position_rejected",
    )


async def test__gitea__token_cannot_read_its_user__still_posts_but_never_deletes_a_review() -> None:
    """A token without read:user could post before; it still can. A failed review can then not be
    attributed to the user, so it is neither cleaned up nor posted again: its comments are ambiguous."""
    routes = _gitea_routes([], json_response({"message": "no such line"}, status_code=500), deleted := [])
    routes["/api/v1/user"] = json_response({"message": "token does not have scope read:user"}, status_code=403)
    transport = RoutedTransport(routes)

    results = await _collect(_gitea(transport), [_ADDED])

    assert len(results) == 1
    assert isinstance(results[0], PostFailure)
    assert results[0].kind == "ambiguous"
    assert results[0].reason.startswith("500 Internal Server Error: no such line")
    assert deleted == []
    assert sum(1 for r in transport.requests if r.method == "POST") == 1


async def test__gitea__token_cannot_read_its_user__posts_the_review() -> None:
    routes = _gitea_routes([], json_response({"id": 3, "html_url": "https://gt/r3"}))
    routes["/api/v1/user"] = json_response({"message": "forbidden"}, status_code=403)
    routes[f"{_GT_PR}/reviews/3/comments"] = json_response([])

    results = await _collect(_gitea(RoutedTransport(routes)), [_ADDED])

    assert results == [PostedNote(note_id="3", url="https://gt/r3")]


async def test__gitea__general_note__returns_its_id_and_link() -> None:
    transport = RoutedTransport(
        {"/api/v1/repos/o/r/issues/7/comments": json_response({"id": 8, "html_url": "https://gt/c8"})}
    )

    assert await _gitea(transport).post_general_note("o/r", 7, "hi") == PostedNote(note_id="8", url="https://gt/c8")


# ── Bitbucket Cloud ──────────────────────────────────────────────────────────

_BB_COMMENTS = "/2.0/repositories/ws/repo/pullrequests/7/comments"


async def test__bitbucket__inline_comment_anchors_the_new_line_and_returns_its_link() -> None:
    transport = RoutedTransport(
        {_BB_COMMENTS: json_response({"id": 77, "links": {"html": {"href": "https://bb/c77"}}}, status_code=201)}
    )
    provider = BitbucketProvider(client=transport.client(), base_url="", token="user:app-password")

    results = await _collect(provider, [_CONTEXT], repo="ws/repo")

    assert _body(transport.requests[0]) == {
        "content": {"raw": _CONTEXT.body},
        "inline": {"to": 3, "path": "src/a.py"},
    }
    assert results == [PostedNote(note_id="77", url="https://bb/c77")]


async def test__bitbucket__refused_comment__reports_the_hosts_message() -> None:
    transport = RoutedTransport(
        {_BB_COMMENTS: json_response({"type": "error", "error": {"message": "Bad request"}}, status_code=400)}
    )
    provider = BitbucketProvider(client=transport.client(), base_url="", token="user:app-password")

    assert await provider.post_general_note("ws/repo", 7, "x") == PostFailure(reason="400 Bad Request: Bad request")
