"""PostReviewUseCase: what gets sent, what gets recorded, and when an iteration counts as posted."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable, Sequence
from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest
from mr_review.core.mrs.entities import DiffFile, DiffHunk, DiffLine
from mr_review.core.reviews.entities import Comment, CommentPost, IterationStage, Review
from mr_review.core.vcs.entities import InlineComment, PostedNote, PostFailure, PostFailureKind, PostResult
from mr_review.use_cases.reviews.post_review import (
    IterationAlreadyPostedError,
    PostingRegistry,
    PostInProgressError,
    PostReviewUseCase,
)

from tests.factories.entities import make_comment, make_host, make_iteration, make_review
from tests.fakes import SingleReviewRepository

pytestmark = pytest.mark.unit

_EARLIER = datetime(2026, 1, 1, tzinfo=timezone.utc)

# src/app.py: line 1 unchanged, line 2 added, line 3 unchanged (old line 2). src/new.py was src/old.py.
_DIFF = [
    DiffFile(
        path="src/app.py",
        additions=1,
        deletions=0,
        hunks=[
            DiffHunk(
                old_start=1,
                new_start=1,
                old_count=2,
                new_count=3,
                lines=[
                    DiffLine(type="context", old_line=1, new_line=1, content="a"),
                    DiffLine(type="added", new_line=2, content="b"),
                    DiffLine(type="context", old_line=2, new_line=3, content="c"),
                ],
            )
        ],
    ),
    DiffFile(
        path="src/new.py",
        old_path="src/old.py",
        additions=1,
        deletions=0,
        hunks=[
            DiffHunk(
                old_start=0,
                new_start=1,
                old_count=0,
                new_count=1,
                lines=[DiffLine(type="added", new_line=1, content="x")],
            )
        ],
    ),
]


_FAILURE_REASONS: dict[PostFailureKind, str] = {
    "position_rejected": "422 Unprocessable Entity: line must be part of the diff",
    "rejected": "401 Unauthorized: Bad credentials",
    "ambiguous": "ReadTimeout talking to the host; the host may have posted it anyway",
    "blocked": "you have a pending review on this pull request in Gitea",
}


class FakeProvider:
    """Records what it is asked to post and answers from a script (accepts everything by default)."""

    def __init__(
        self,
        refuse_inline: set[str] | None = None,
        refuse_notes: bool = False,
        fail_inline: dict[str, PostFailureKind] | None = None,
    ) -> None:
        self.inline_calls: list[list[InlineComment]] = []
        self.notes: list[str] = []
        # Bodies whose position the host refuses, and bodies that fail some other way.
        self.fail_inline: dict[str, PostFailureKind] = {
            **dict.fromkeys(refuse_inline or set(), "position_rejected"),
            **(fail_inline or {}),
        }
        self.refuse_notes = refuse_notes
        self.hold: asyncio.Event | None = None
        self.entered = asyncio.Event()
        self.explode_after: int | None = None
        self._ids = 0

    def _next_id(self) -> str:
        self._ids += 1
        return str(self._ids)

    async def get_diff_refs(self, repo_path: str, mr_iid: int) -> dict[str, str]:
        return {"base_sha": "b", "start_sha": "s", "head_sha": "h"}

    async def get_diff(self, repo_path: str, mr_iid: int) -> list[DiffFile]:
        return _DIFF

    async def post_inline_comments(
        self, repo_path: str, mr_iid: int, diff_refs: dict[str, str], comments: Sequence[InlineComment]
    ) -> AsyncIterator[PostResult]:
        self.inline_calls.append(list(comments))
        for position, comment in enumerate(comments):
            if self.explode_after is not None and position == self.explode_after:
                raise RuntimeError("provider bug")
            if self.hold is not None:
                self.entered.set()
                await self.hold.wait()
            kind = self.fail_inline.get(comment.body.split(" · ", 1)[-1])
            if kind is not None:
                yield PostFailure(reason=_FAILURE_REASONS[kind], kind=kind)
            else:
                note_id = self._next_id()
                yield PostedNote(note_id=note_id, url=f"https://host/mr#note_{note_id}")

    async def post_general_note(self, repo_path: str, mr_iid: int, body: str) -> PostResult:
        self.notes.append(body)
        if self.refuse_notes:
            return PostFailure(reason="403 Forbidden: no access")
        return PostedNote(note_id=self._next_id())

    def inline_bodies(self) -> list[str]:
        return [comment.body for call in self.inline_calls for comment in call]


class InMemoryReviews(SingleReviewRepository):
    """Holds one review and, unlike its base, answers only that review's id."""

    review: Review

    @property
    def updates(self) -> int:
        return len(self.writes)

    async def get_by_id(self, review_id: UUID) -> Review | None:
        return self.review if review_id == self.review.id else None

    async def update_with(self, review_id: UUID, change: Callable[[Review], Review]) -> Review | None:
        return await super().update_with(review_id, change) if review_id == self.review.id else None


class Hosts:
    async def get_by_id(self, host_id: UUID) -> object:
        return make_host(id=host_id)


def _setup(
    comments: list[Comment],
    provider: FakeProvider | None = None,
    stage: IterationStage = IterationStage.polish,
    completed_at: datetime | None = None,
    registry: PostingRegistry | None = None,
) -> tuple[PostReviewUseCase, InMemoryReviews, FakeProvider]:
    review = make_review(iterations=[make_iteration(stage=stage, comments=comments, completed_at=completed_at)])
    repo = InMemoryReviews(review)
    fake = provider or FakeProvider()
    use_case = PostReviewUseCase(repo, Hosts(), vcs_factory=lambda _host: fake, registry=registry)  # type: ignore[arg-type]
    return use_case, repo, fake


def _stored(repo: InMemoryReviews) -> dict[str, CommentPost]:
    """The stored post record of each comment that has one, by comment body."""
    return {c.body: c.post for c in repo.review.iterations[0].comments if c.post is not None}


# ── finding 1: posted comments must not be posted twice ──────────────────────


async def test__post__completed_iteration__refuses_without_force_and_sends_nothing() -> None:
    """Re-posting a completed iteration used to only log a warning and send every comment again."""
    use_case, repo, provider = _setup([make_comment(body="A")], stage=IterationStage.post, completed_at=_EARLIER)

    with pytest.raises(IterationAlreadyPostedError, match="already posted"):
        await use_case.execute(repo.review.id)

    assert provider.inline_calls == []
    assert provider.notes == []
    assert repo.updates == 0


async def test__post__records_every_outcome_on_its_comment() -> None:
    """Which comment went where (and its id on the host) is stored, so a reload can show it."""
    use_case, repo, _ = _setup(
        [
            make_comment(file="src/app.py", line=2, body="A"),
            make_comment(file=None, line=None, body="B"),
        ]
    )

    result = await use_case.execute(repo.review.id)

    stored = _stored(repo)
    assert (stored["A"].outcome, stored["A"].note_id, stored["A"].url) == ("inline", "1", "https://host/mr#note_1")
    assert (stored["B"].outcome, stored["B"].note_id) == ("general_note", "2")
    assert (result.posted, result.failed, result.skipped, result.completed) == (2, 0, 0, True)


async def test__post__retry__sends_only_comments_not_on_the_mr() -> None:
    """A second post after a partial one must not duplicate the comments that already landed."""
    on_mr = make_comment(file="src/app.py", line=2, body="A").model_copy(
        update={"post": CommentPost(outcome="inline", at=_EARLIER, note_id="9")}
    )
    failed = make_comment(file="src/app.py", line=3, body="B").model_copy(
        update={"post": CommentPost(outcome="failed", at=_EARLIER, reason="boom")}
    )
    fresh = make_comment(file=None, line=None, body="C")
    use_case, repo, provider = _setup([on_mr, failed, fresh], stage=IterationStage.post)

    result = await use_case.execute(repo.review.id)

    assert provider.inline_bodies() == ["**Minor** · B"]
    assert provider.notes == ["**Minor** · C"]
    assert result.skipped == 1
    stored = _stored(repo)
    assert stored["A"].note_id == "9"
    assert result.completed is True


async def test__post__force__posts_a_completed_iteration_again() -> None:
    comment = make_comment(file=None, line=None, body="A").model_copy(
        update={"post": CommentPost(outcome="general_note", at=_EARLIER, note_id="9")}
    )
    use_case, repo, provider = _setup([comment], stage=IterationStage.post, completed_at=_EARLIER)

    result = await use_case.execute(repo.review.id, force=True)

    assert provider.notes == ["**Minor** · A"]
    assert result.skipped == 0
    completed_at = repo.review.iterations[0].completed_at
    assert completed_at is not None
    assert completed_at > _EARLIER


async def test__post__second_request_while_posting__is_refused() -> None:
    """A click while the first post still runs (the old 30 s client timeout) must not post again."""
    provider = FakeProvider()
    provider.hold = asyncio.Event()
    registry = PostingRegistry()
    use_case, repo, _ = _setup([make_comment(file="src/app.py", line=2, body="A")], provider, registry=registry)

    first = asyncio.create_task(use_case.execute(repo.review.id))
    await provider.entered.wait()
    with pytest.raises(PostInProgressError):
        await use_case.execute(repo.review.id)
    provider.hold.set()
    await first

    assert len(provider.inline_bodies()) == 1


async def test__post__a_post_finished_after_the_request_read_the_review__is_not_repeated() -> None:
    """The request's own read may predate a post that completed meanwhile; the post reads again."""
    use_case, repo, provider = _setup([make_comment(file=None, line=None, body="A")])
    stale = repo.review
    iteration = stale.iterations[0]
    repo.review = stale.model_copy(
        update={"iterations": [iteration.model_copy(update={"stage": IterationStage.post, "completed_at": _EARLIER})]}
    )
    reads = iter([stale])

    async def stale_then_current(review_id: UUID) -> Review | None:
        return next(reads, repo.review)

    repo.get_by_id = stale_then_current  # type: ignore[method-assign]

    with pytest.raises(IterationAlreadyPostedError):
        await use_case.execute(repo.review.id)

    assert provider.notes == []


async def test__post__client_goes_away__post_still_finishes_and_records() -> None:
    """Cancelling the request (client disconnect) must not lose the record of what was posted."""
    provider = FakeProvider()
    provider.hold = asyncio.Event()
    use_case, repo, _ = _setup([make_comment(file="src/app.py", line=2, body="A")], provider)

    request = asyncio.create_task(use_case.execute(repo.review.id))
    await provider.entered.wait()
    request.cancel()
    provider.hold.set()
    with pytest.raises(asyncio.CancelledError):
        await request
    async with asyncio.timeout(1):
        while repo.review.iterations[0].completed_at is None:
            await asyncio.sleep(0)

    stored = _stored(repo)
    assert stored["A"].outcome == "inline"


# ── finding 2: failures are failures ─────────────────────────────────────────


async def test__post__nothing_lands__iteration_is_not_completed() -> None:
    """The iteration used to be marked posted even when 0 comments were posted."""
    use_case, repo, _ = _setup([make_comment(file=None, line=None, body="A")], FakeProvider(refuse_notes=True))

    result = await use_case.execute(repo.review.id)

    iteration = repo.review.iterations[0]
    assert (iteration.stage, iteration.completed_at) == (IterationStage.polish, None)
    assert (result.posted, result.failed, result.completed) == (0, 1, False)
    stored = _stored(repo)
    assert (stored["A"].outcome, stored["A"].reason) == ("failed", "403 Forbidden: no access")


async def test__post__partly_lands__stays_in_post_without_completing() -> None:
    use_case, repo, _ = _setup(
        [make_comment(file="src/app.py", line=2, body="A"), make_comment(file="src/app.py", line=3, body="B")],
        FakeProvider(refuse_inline={"B"}),
    )

    result = await use_case.execute(repo.review.id, fallback_to_general_note=False)

    iteration = repo.review.iterations[0]
    assert (iteration.stage, iteration.completed_at) == (IterationStage.post, None)
    assert (result.posted, result.failed, result.completed) == (1, 1, False)
    stored = _stored(repo)
    assert stored["B"].outcome == "failed"
    assert "line must be part of the diff" in str(stored["B"].reason)


async def test__post__refused_inline_with_fallback__becomes_a_note_naming_its_line() -> None:
    use_case, repo, provider = _setup(
        [make_comment(file="src/app.py", line=3, body="B", severity="major")], FakeProvider(refuse_inline={"B"})
    )

    await use_case.execute(repo.review.id)

    assert provider.notes == ["**Major** · `src/app.py:3`\n\nB"]
    stored = _stored(repo)
    assert stored["B"].outcome == "general_note"
    assert "inline comment refused" in str(stored["B"].reason)


async def test__post__line_outside_the_diff__goes_straight_to_a_note() -> None:
    use_case, repo, provider = _setup([make_comment(file="src/app.py", line=40, body="A")])

    await use_case.execute(repo.review.id)

    assert provider.inline_calls == []
    assert provider.notes == ["**Minor** · `src/app.py:40`\n\nA"]
    stored = _stored(repo)
    assert stored["A"].reason == "line 40 of src/app.py is not part of the MR diff"


async def test__post__line_outside_the_diff_without_fallback__fails_without_a_request() -> None:
    use_case, repo, provider = _setup([make_comment(file="docs/x.md", line=4, body="A")])

    result = await use_case.execute(repo.review.id, fallback_to_general_note=False)

    assert (provider.inline_calls, provider.notes) == ([], [])
    assert result.failed == 1
    stored = _stored(repo)
    assert "docs/x.md is not part of the MR diff" in str(stored["A"].reason)


async def test__post__file_level_comment__note_names_the_file() -> None:
    """A comment with a file but no line used to lose its file name when posted."""
    use_case, repo, provider = _setup([make_comment(file="src/app.py", line=None, body="Split this module.")])

    await use_case.execute(repo.review.id)

    assert provider.notes == ["**Minor** · `src/app.py`\n\nSplit this module."]


@pytest.mark.parametrize(
    ("style", "expected"),
    [("bold", "**Critical** · Fix it"), ("tag", "[critical] Fix it"), ("off", "Fix it")],
)
async def test__post__severity_label__heads_the_inline_body(style: str, expected: str) -> None:
    """Inline bodies used to carry no severity at all."""
    use_case, repo, provider = _setup([make_comment(file="src/app.py", line=2, body="Fix it", severity="critical")])

    await use_case.execute(repo.review.id, severity_label=style)  # type: ignore[arg-type]

    assert provider.inline_bodies() == [expected]


async def test__post__provider_crashes_midway__earlier_outcomes_survive() -> None:
    provider = FakeProvider()
    provider.explode_after = 1
    use_case, repo, _ = _setup(
        [make_comment(file="src/app.py", line=2, body="A"), make_comment(file="src/app.py", line=3, body="B")],
        provider,
    )

    result = await use_case.execute(repo.review.id, fallback_to_general_note=False)

    stored = _stored(repo)
    assert stored["A"].outcome == "inline"
    assert stored["B"].outcome == "failed"
    assert "unexpected error" in str(stored["B"].reason)
    assert result.completed is False


# ── finding 3: anchors ───────────────────────────────────────────────────────


async def test__post__anchors__unchanged_lines_carry_both_sides_and_renames_the_old_path() -> None:
    use_case, repo, provider = _setup(
        [
            make_comment(file="src/new.py", line=1, body="R"),
            make_comment(file="src/app.py", line=3, body="C"),
            make_comment(file="src/app.py", line=2, body="A"),
        ]
    )

    await use_case.execute(repo.review.id)

    anchors = {c.body.split(" · ")[-1]: c.anchor for call in provider.inline_calls for c in call}
    assert (anchors["C"].new_line, anchors["C"].old_line) == (3, 2)
    assert (anchors["A"].new_line, anchors["A"].old_line) == (2, None)
    assert (anchors["R"].path, anchors["R"].old_path) == ("src/new.py", "src/old.py")
    # One batch, in diff order.
    assert [c.body[-1] for c in provider.inline_calls[0]] == ["A", "C", "R"]


# ── edges ────────────────────────────────────────────────────────────────────


async def test__post__no_kept_comments__sends_and_stores_nothing() -> None:
    use_case, repo, provider = _setup([make_comment(status="dismissed")])

    result = await use_case.execute(repo.review.id)

    assert (result.results, result.completed, repo.updates) == ([], False, 0)
    assert (provider.inline_calls, provider.notes) == ([], [])


async def test__post__no_iterations__returns_an_empty_result() -> None:
    review = make_review(iterations=[])
    repo = InMemoryReviews(review)
    use_case = PostReviewUseCase(repo, Hosts(), vcs_factory=lambda _host: FakeProvider())  # type: ignore[arg-type]

    result = await use_case.execute(review.id)

    assert (result.iteration_id, result.results, repo.updates) == (None, [], 0)


async def test__post__review_not_found__raises_value_error() -> None:
    use_case, _, _ = _setup([])

    with pytest.raises(ValueError, match="not found"):
        await use_case.execute(uuid4())
