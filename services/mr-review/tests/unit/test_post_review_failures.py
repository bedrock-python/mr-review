"""Failures that must not turn into duplicates: the use case driving real providers over a mock host.

Only a definitive refusal of a comment's position may become a general note. After a timeout or a
5xx the comment may already be on the MR, so it is recorded as ambiguous and not sent again unless
that is asked for; a comment Gitea would not post because of the user's own pending review is
blocked. (The reviewer's reproductions: a GitHub review or a GitLab discussion that times out used
to be posted again as general notes, and Gitea's pending-review guard did the same.)
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest
from mr_review.core.mrs.entities import DiffFile
from mr_review.core.reviews.entities import Comment, CommentPost, IterationStage
from mr_review.core.vcs.protocols import VCSProvider
from mr_review.infra.vcs.gitea import GiteaProvider
from mr_review.infra.vcs.github import GitHubProvider
from mr_review.infra.vcs.gitlab import GitLabProvider
from mr_review.use_cases.reviews.create_comment import CreateCommentUseCase
from mr_review.use_cases.reviews.delete_comment import DeleteCommentUseCase
from mr_review.use_cases.reviews.dto import CommentPatchDTO
from mr_review.use_cases.reviews.post_review import PostInProgressError, PostReviewUseCase
from mr_review.use_cases.reviews.posting_registry import PostingRegistry
from mr_review.use_cases.reviews.update_review import UpdateReviewUseCase

from tests.factories.entities import make_comment, make_iteration, make_review
from tests.factories.vcs_http import RoutedTransport, json_response, raw_path
from tests.unit.test_post_review import _DIFF, FakeProvider, Hosts, InMemoryReviews

pytestmark = pytest.mark.unit

_GH = "/repos/team/service"
_GL = "/api/v4/projects/team%2Fservice/merge_requests/1"
_GT = "/api/v1/repos/team/service/pulls/1"
_REFS = {"base_sha": "b", "start_sha": "s", "head_sha": "h"}


class HostTransport(RoutedTransport):
    """The host receives a request on ``timeout_paths`` (it is recorded) but the answer never comes back."""

    def __init__(self, routes: dict[str, Any], timeout_paths: frozenset[str] = frozenset()) -> None:
        super().__init__(routes)
        self.timeout_paths = timeout_paths

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if raw_path(request) in self.timeout_paths:
            self.requests.append(request)
            raise httpx.ReadTimeout("read timed out", request=request)
        return super().__call__(request)

    def count(self, method: str, path: str) -> int:
        return sum(1 for r in self.requests if r.method == method and raw_path(r) == path)


def _with_diff(provider: Any) -> VCSProvider:
    async def get_diff(repo_path: str, mr_iid: int) -> list[DiffFile]:
        return _DIFF

    async def get_diff_refs(repo_path: str, mr_iid: int) -> dict[str, str]:
        return _REFS

    provider.get_diff = get_diff
    provider.get_diff_refs = get_diff_refs
    return provider  # type: ignore[no-any-return]


def _two_inline() -> list[Comment]:
    return [
        make_comment(file="src/app.py", line=2, body="first"),
        make_comment(file="src/app.py", line=3, body="second"),
    ]


def _setup(provider: VCSProvider, comments: list[Comment]) -> tuple[PostReviewUseCase, InMemoryReviews]:
    repo = InMemoryReviews(make_review(iterations=[make_iteration(stage=IterationStage.polish, comments=comments)]))
    return PostReviewUseCase(repo, Hosts(), vcs_factory=lambda _host: provider), repo  # type: ignore[arg-type]


def _posts(repo: InMemoryReviews) -> list[CommentPost | None]:
    return [c.post for c in repo.review.iterations[0].comments]


# ── finding 1: ambiguous failures never fall back ────────────────────────────


async def test__github_review_times_out__no_general_notes_and_nothing_resent_by_default() -> None:
    transport = HostTransport(
        {f"{_GH}/issues/1/comments": json_response({"id": 900, "html_url": "u"})},
        timeout_paths=frozenset({f"{_GH}/pulls/1/reviews"}),
    )
    provider = _with_diff(GitHubProvider(client=transport.client(), base_url="https://github.com", token="t"))
    use_case, repo = _setup(provider, _two_inline())

    result = await use_case.execute(repo.review.id)

    assert transport.count("POST", f"{_GH}/issues/1/comments") == 0
    posts = _posts(repo)
    assert all(p is not None and p.outcome == "failed" and p.failure_kind == "ambiguous" for p in posts)
    assert "check the MR before retrying" in str(posts[0] and posts[0].reason)
    assert (result.posted, result.failed, result.completed) == (0, 2, False)
    assert repo.review.iterations[0].completed_at is None

    retry = await use_case.execute(repo.review.id)

    assert (retry.results, retry.held_back) == ([], 2)
    assert transport.count("POST", f"{_GH}/pulls/1/reviews") == 1


async def test__ambiguous_failures__are_sent_again_only_when_asked() -> None:
    transport = HostTransport(
        {f"{_GH}/pulls/1/reviews": json_response({"id": 5, "html_url": "r"})},
        timeout_paths=frozenset(),
    )
    provider = _with_diff(GitHubProvider(client=transport.client(), base_url="https://github.com", token="t"))
    ambiguous = CommentPost(outcome="failed", at=make_iteration().created_at, failure_kind="ambiguous", reason="x")
    comments = [c.model_copy(update={"post": ambiguous}) for c in _two_inline()]
    use_case, repo = _setup(provider, comments)

    result = await use_case.execute(repo.review.id, resend_ambiguous=True)

    assert transport.count("POST", f"{_GH}/pulls/1/reviews") == 1
    assert (result.posted, result.held_back, result.completed) == (2, 0, True)


async def test__github_review_answers_502__fails_ambiguous_without_retrying_one_by_one() -> None:
    transport = HostTransport({f"{_GH}/pulls/1/reviews": json_response({"message": "Bad gateway"}, status_code=502)})
    provider = _with_diff(GitHubProvider(client=transport.client(), base_url="https://github.com", token="t"))
    use_case, repo = _setup(provider, _two_inline())

    await use_case.execute(repo.review.id)

    assert transport.paths() == [f"{_GH}/pulls/1/reviews"]
    assert [p and p.failure_kind for p in _posts(repo)] == ["ambiguous", "ambiguous"]


async def test__gitlab_discussion_times_out__no_general_note() -> None:
    transport = HostTransport(
        {f"{_GL}/notes": json_response({"id": 901})},
        timeout_paths=frozenset({f"{_GL}/discussions"}),
    )
    provider = _with_diff(GitLabProvider(client=transport.client(), base_url="https://gitlab.example.com", token="t"))
    use_case, repo = _setup(provider, _two_inline())

    await use_case.execute(repo.review.id)

    assert transport.count("POST", f"{_GL}/notes") == 0
    assert [p and p.failure_kind for p in _posts(repo)] == ["ambiguous", "ambiguous"]


async def test__gitlab_refuses_the_position__still_becomes_a_general_note() -> None:
    def discussions(_request: httpx.Request) -> httpx.Response:
        return json_response({"message": {"line_code": ["must be a valid line code"]}}, status_code=400)

    transport = HostTransport({f"{_GL}/discussions": discussions, f"{_GL}/notes": json_response({"id": 902})})
    provider = _with_diff(GitLabProvider(client=transport.client(), base_url="https://gitlab.example.com", token="t"))
    use_case, repo = _setup(provider, _two_inline()[:1])

    await use_case.execute(repo.review.id)

    assert transport.count("POST", f"{_GL}/notes") == 1
    post = _posts(repo)[0]
    assert post is not None
    assert (post.outcome, post.failure_kind) == ("general_note", None)


async def test__gitlab_refuses_for_another_reason__fails_without_a_general_note() -> None:
    transport = HostTransport({f"{_GL}/discussions": json_response({"message": "403 Forbidden"}, status_code=403)})
    provider = _with_diff(GitLabProvider(client=transport.client(), base_url="https://gitlab.example.com", token="t"))
    use_case, repo = _setup(provider, _two_inline()[:1])

    await use_case.execute(repo.review.id)

    assert transport.count("POST", f"{_GL}/notes") == 0
    post = _posts(repo)[0]
    assert post is not None
    assert (post.outcome, post.failure_kind) == ("failed", "rejected")


async def test__provider_crash__the_unanswered_comments_are_ambiguous() -> None:
    provider = FakeProvider()
    provider.explode_after = 0
    use_case, repo = _setup(provider, _two_inline())  # type: ignore[arg-type]

    await use_case.execute(repo.review.id)

    assert provider.notes == []
    assert [p and p.failure_kind for p in _posts(repo)] == ["ambiguous", "ambiguous"]


# ── findings 2 and 3: Gitea ──────────────────────────────────────────────────


def _gitea(transport: RoutedTransport) -> VCSProvider:
    return _with_diff(GiteaProvider(client=transport.client(), base_url="https://gitea.example.com", token="t"))


async def test__gitea_users_pending_review__blocks_without_general_notes() -> None:
    pending = [{"id": 5, "state": "PENDING", "user": {"login": "me"}}]
    transport = HostTransport(
        {
            "/api/v1/user": json_response({"login": "me"}),
            f"{_GT}/reviews": lambda r: json_response(pending) if r.method == "GET" else json_response({"id": 6}),
            "/api/v1/repos/team/service/issues/1/comments": json_response({"id": 77, "html_url": "u"}),
        }
    )
    use_case, repo = _setup(_gitea(transport), _two_inline())

    result = await use_case.execute(repo.review.id)

    assert transport.count("POST", "/api/v1/repos/team/service/issues/1/comments") == 0
    assert transport.count("POST", f"{_GT}/reviews") == 0
    assert [p and p.failure_kind for p in _posts(repo)] == ["blocked", "blocked"]
    assert "submit or discard it" in str(_posts(repo)[0] and _posts(repo)[0].reason)  # type: ignore[union-attr]
    assert (result.completed, repo.review.iterations[0].stage) == (False, IterationStage.polish)


async def test__gitea_500_after_the_review_was_submitted__records_it_and_posts_nothing_again() -> None:
    reviews: list[dict[str, Any]] = [{"id": 1, "state": "COMMENT", "user": {"login": "me"}, "commit_id": "old"}]

    def review_list_or_create(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return json_response(reviews)
        # Gitea submitted the review, then failed while answering.
        reviews.append({"id": 2, "state": "COMMENT", "user": {"login": "me"}, "commit_id": "h", "html_url": "r2"})
        return json_response({"message": "convert review"}, status_code=500)

    created = [
        {"id": 21, "path": "src/app.py", "body": "**Minor** · first", "html_url": "c21"},
        {"id": 22, "path": "src/app.py", "body": "**Minor** · second", "html_url": "c22"},
    ]
    transport = HostTransport(
        {
            "/api/v1/user": json_response({"login": "me"}),
            f"{_GT}/reviews": review_list_or_create,
            f"{_GT}/reviews/2/comments": json_response(created),
        }
    )
    use_case, repo = _setup(_gitea(transport), _two_inline())

    result = await use_case.execute(repo.review.id)

    assert transport.count("POST", f"{_GT}/reviews") == 1
    assert [(p and p.outcome, p and p.note_id) for p in _posts(repo)] == [("inline", "21"), ("inline", "22")]
    assert result.completed is True


async def test__gitea_500_that_cannot_be_checked__is_ambiguous_and_not_reposted() -> None:
    calls = {"get": 0}

    def review_list_or_create(request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            return json_response({"message": "boom"}, status_code=500)
        calls["get"] += 1
        if calls["get"] == 1:
            return json_response([])
        return json_response({"message": "down"}, status_code=503)

    transport = HostTransport({"/api/v1/user": json_response({"login": "me"}), f"{_GT}/reviews": review_list_or_create})
    use_case, repo = _setup(_gitea(transport), _two_inline())

    await use_case.execute(repo.review.id)

    assert transport.count("POST", f"{_GT}/reviews") == 1
    assert [p and p.failure_kind for p in _posts(repo)] == ["ambiguous", "ambiguous"]


async def test__gitea_422__clears_the_pending_review_and_posts_one_by_one() -> None:
    reviews: list[dict[str, Any]] = []
    deleted: list[str] = []
    posts = {"n": 0}

    def review_list_or_create(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return json_response(reviews)
        posts["n"] += 1
        if posts["n"] == 1:
            reviews.append({"id": 9, "state": "PENDING", "user": {"login": "me"}})
            return json_response({"message": "review content is empty"}, status_code=422)
        return json_response({"id": 10 + posts["n"], "html_url": "r"})

    def delete(_request: httpx.Request) -> httpx.Response:
        deleted.append("x")
        reviews.clear()
        return httpx.Response(204)

    transport = HostTransport(
        {
            "/api/v1/user": json_response({"login": "me"}),
            f"{_GT}/reviews": review_list_or_create,
            f"{_GT}/reviews/9": delete,
            f"{_GT}/reviews/12/comments": json_response([]),
            f"{_GT}/reviews/13/comments": json_response([]),
        }
    )
    use_case, repo = _setup(_gitea(transport), _two_inline())

    result = await use_case.execute(repo.review.id)

    assert deleted == ["x"]
    assert transport.count("POST", f"{_GT}/reviews") == 3
    assert result.completed is True


# ── finding 4: one post per review, no edits while it runs ───────────────────


async def test__two_iterations_of_one_review__cannot_post_at_once() -> None:
    provider = FakeProvider()
    provider.hold = asyncio.Event()
    first, second = make_iteration(comments=_two_inline()[:1]), make_iteration(number=2, comments=_two_inline()[1:])
    repo = InMemoryReviews(make_review(iterations=[first, second]))
    use_case = PostReviewUseCase(repo, Hosts(), vcs_factory=lambda _host: provider, registry=PostingRegistry())  # type: ignore[arg-type]

    running = asyncio.create_task(use_case.execute(repo.review.id, iteration_id=first.id))
    await provider.entered.wait()
    with pytest.raises(PostInProgressError):
        await use_case.execute(repo.review.id, iteration_id=second.id)
    provider.hold.set()
    await running


async def test__comment_edits_while_the_review_is_posted__are_refused() -> None:
    provider = FakeProvider()
    provider.hold = asyncio.Event()
    registry = PostingRegistry()
    comment = make_comment(file="src/app.py", line=2, body="first")
    iteration = make_iteration(comments=[comment])
    repo = InMemoryReviews(make_review(iterations=[iteration]))
    use_case = PostReviewUseCase(repo, Hosts(), vcs_factory=lambda _host: provider, registry=registry)  # type: ignore[arg-type]

    running = asyncio.create_task(use_case.execute(repo.review.id))
    await provider.entered.wait()
    review_id = repo.review.id
    with pytest.raises(PostInProgressError):
        await UpdateReviewUseCase(repo, registry).execute(  # type: ignore[arg-type]
            review_id, iteration_id=iteration.id, comment_patches=[CommentPatchDTO(id=comment.id, body="x")]
        )
    with pytest.raises(PostInProgressError):
        await CreateCommentUseCase(repo, registry).execute(review_id, iteration.id, "minor", "new")  # type: ignore[arg-type]
    with pytest.raises(PostInProgressError):
        await DeleteCommentUseCase(repo, registry).execute(review_id, iteration.id, comment.id)  # type: ignore[arg-type]
    provider.hold.set()
    await running

    stored = repo.review.iterations[0].comments
    assert [(c.body, c.post is not None) for c in stored] == [("first", True)]


async def test__comment_patch__keeps_the_post_record() -> None:
    """A post record is the server's: editing the comment afterwards must not drop it."""
    comment = make_comment(file="src/app.py", line=2, body="first")
    iteration = make_iteration(comments=[comment])
    record = CommentPost(outcome="inline", at=iteration.created_at, note_id="7")
    posted = iteration.model_copy(update={"comments": [comment.model_copy(update={"post": record})]})
    repo = InMemoryReviews(make_review(iterations=[posted]))

    updated = await UpdateReviewUseCase(repo).execute(  # type: ignore[arg-type]
        repo.review.id, iteration_id=iteration.id, comment_patches=[CommentPatchDTO(id=comment.id, body="edited")]
    )

    assert [(c.body, c.post) for c in updated.iterations[0].comments] == [("edited", record)]
