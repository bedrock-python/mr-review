"""Post the kept comments of an iteration to its merge request.

Every comment's outcome is stored on it as soon as the host answers, so a post that is cut short
(a client timeout, a dropped connection, a crash) never sends the same comment twice: the next post
sends only what is not on the MR yet. The iteration is completed once every kept comment is there.

A comment the host refused because of its place in the diff may stand in as a general note. One
whose fate is unknown (a timeout, a 5xx) may be on the MR already: it is neither turned into a
general note nor sent again unless the caller asks for that explicitly.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.mrs.entities import DiffFile
from mr_review.core.reviews.entities import Comment, CommentPost, Iteration, IterationStage, Review
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.core.reviews.sources import MRSource
from mr_review.core.vcs.entities import InlineComment, LineAnchor, PostedNote, PostFailure, PostResult
from mr_review.core.vcs.protocols import VCSProvider, VCSProviderFactory
from mr_review.use_cases.reviews._review_change import apply_review_change
from mr_review.use_cases.reviews.iteration_comments import find_iteration_index, replace_iteration
from mr_review.use_cases.reviews.post_body import SeverityLabel, format_post_body
from mr_review.use_cases.reviews.posting_registry import PostingRegistry, PostInProgressError

logger = logging.getLogger(__name__)

__all__ = [
    "CommentPostResult",
    "IterationAlreadyPostedError",
    "PostInProgressError",
    "PostNotSupportedForSourceError",
    "PostReviewResult",
    "PostReviewUseCase",
    "PostingRegistry",
    "apply_post_records",
]


class PostNotSupportedForSourceError(ValueError):
    """Raised when posting comments is attempted on a review whose source has no MR/PR target."""


class IterationAlreadyPostedError(Exception):
    """Every kept comment of the iteration is already on the MR; posting again needs ``force``."""

    def __init__(self, iteration: Iteration) -> None:
        self.iteration_id = iteration.id
        self.completed_at = iteration.completed_at
        posted_at = iteration.completed_at.isoformat() if iteration.completed_at else "an earlier post"
        super().__init__(
            f"Iteration {iteration.number} was already posted at {posted_at}; send force to post its comments again"
        )


@dataclass(frozen=True)
class CommentPostResult:
    comment_id: UUID
    post: CommentPost


@dataclass(frozen=True)
class PostReviewResult:
    review: Review
    iteration_id: UUID | None
    # Comments this call sent (or gave up on), in the order they went out.
    results: list[CommentPostResult]
    # Kept comments that were already on the MR and were not sent again.
    skipped: int
    # Every kept comment of the iteration is on the MR.
    completed: bool
    # Kept comments whose last attempt was ambiguous and that were not sent again.
    held_back: int = 0

    @property
    def posted(self) -> int:
        return sum(1 for result in self.results if result.post.is_on_mr)

    @property
    def failed(self) -> int:
        return len(self.results) - self.posted


@dataclass(frozen=True)
class _Plan:
    comment: Comment
    # Set: post inline there. None: post a general note (or fail, when ``failure`` is set).
    anchor: LineAnchor | None = None
    # Heads a general note that stands for a place in the diff: "path" or "path:line".
    location: str | None = None
    # Why a comment with a line is not inline.
    reason: str | None = None
    # Not sent at all: why.
    failure: str | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_postable(iteration: Iteration, force: bool) -> None:
    if iteration.completed_at is not None and not force:
        raise IterationAlreadyPostedError(iteration)


def _failed(failure: PostFailure) -> CommentPost:
    return CommentPost(outcome="failed", at=_now(), reason=failure.reason, failure_kind=failure.kind)


def _anchor_index(diff_files: list[DiffFile]) -> dict[str, dict[int, LineAnchor]]:
    """Every new-file line the diff shows, by file path: the only lines an inline comment can sit on."""
    index: dict[str, dict[int, LineAnchor]] = {}
    for diff_file in diff_files:
        lines = index.setdefault(diff_file.path, {})
        old_path = diff_file.old_path or diff_file.path
        for hunk in diff_file.hunks:
            for line in hunk.lines:
                if line.new_line is None:
                    continue
                lines[line.new_line] = LineAnchor(
                    path=diff_file.path,
                    old_path=old_path,
                    new_line=line.new_line,
                    old_line=line.old_line if line.type == "context" else None,
                )
    return index


def _plan(comment: Comment, index: dict[str, dict[int, LineAnchor]], fallback_to_general_note: bool) -> _Plan:
    if comment.file is None:
        return _Plan(comment=comment)
    if comment.line is None:
        return _Plan(comment=comment, location=comment.file)
    file_lines = index.get(comment.file)
    anchor = file_lines.get(comment.line) if file_lines is not None else None
    if anchor is not None:
        return _Plan(comment=comment, anchor=anchor)
    reason = (
        f"{comment.file} is not part of the MR diff"
        if file_lines is None
        else f"line {comment.line} of {comment.file} is not part of the MR diff"
    )
    if not fallback_to_general_note:
        return _Plan(comment=comment, failure=f"{reason} (falling back to a general note is off)")
    return _Plan(comment=comment, location=f"{comment.file}:{comment.line}", reason=reason)


def apply_post_records(
    review: Review,
    iteration_id: UUID,
    records: dict[UUID, CommentPost],
    *,
    finish: bool,
    now: datetime,
) -> Review:
    """``review`` with ``records`` written onto the iteration's comments: a pure function of a review
    read just before writing, so whatever else changed in it meanwhile is kept.

    With ``finish`` the iteration is also settled: completed once every kept comment is on the MR,
    and in the post stage (frozen) as soon as any is.
    """
    index = find_iteration_index(review, iteration_id)
    iteration = review.iterations[index]
    comments = [
        comment.model_copy(update={"post": records[comment.id]}) if comment.id in records else comment
        for comment in iteration.comments
    ]
    updates: dict[str, object] = {"comments": comments}
    if finish:
        kept = [comment for comment in comments if comment.status == "kept"]
        all_on_mr = bool(kept) and all(comment.is_on_mr for comment in kept)
        if all_on_mr or any(comment.is_on_mr for comment in comments):
            updates["stage"] = IterationStage.post
        updates["completed_at"] = now if all_on_mr else None
    return replace_iteration(review, index, iteration.model_copy(update=updates))


class _Recorder:
    """Writes each outcome onto its comment as it comes in, re-reading the review every time.

    Every save applies all outcomes so far, so a write that slipped in between is repaired by the
    next one.
    """

    def __init__(self, repo: ReviewRepository, review_id: UUID, iteration_id: UUID) -> None:
        self._repo = repo
        self._review_id = review_id
        self._iteration_id = iteration_id
        self._records: dict[UUID, CommentPost] = {}
        self._lock = asyncio.Lock()

    async def record(self, comment_id: UUID, post: CommentPost) -> None:
        async with self._lock:
            self._records[comment_id] = post
            await self._save(finish=False)

    async def finish(self) -> Review:
        async with self._lock:
            return await self._save(finish=True)

    async def _save(self, finish: bool) -> Review:
        records, now = dict(self._records), _now()
        return await apply_review_change(
            self._repo,
            self._review_id,
            lambda review: apply_post_records(review, self._iteration_id, records, finish=finish, now=now),
        )


@dataclass(frozen=True)
class _PostRun:
    provider: VCSProvider
    recorder: _Recorder
    repo_path: str
    mr_iid: int
    severity_label: SeverityLabel
    fallback_to_general_note: bool


@dataclass(frozen=True)
class _PostOptions:
    force: bool
    resend_ambiguous: bool
    diff_refs: dict[str, str] | None


class PostReviewUseCase:
    def __init__(
        self,
        review_repo: ReviewRepository,
        host_repo: HostRepository,
        vcs_factory: VCSProviderFactory,
        registry: PostingRegistry | None = None,
    ) -> None:
        self._review_repo = review_repo
        self._host_repo = host_repo
        self._vcs_factory = vcs_factory
        self._registry = registry if registry is not None else PostingRegistry()

    async def execute(
        self,
        review_id: UUID,
        diff_refs: dict[str, str] | None = None,
        iteration_id: UUID | None = None,
        fallback_to_general_note: bool = True,
        *,
        force: bool = False,
        resend_ambiguous: bool = False,
        severity_label: SeverityLabel = "bold",
    ) -> PostReviewResult:
        """Post the kept comments that are not on the MR yet (all kept ones with ``force``).

        Comments whose last attempt was ambiguous are sent again only with ``resend_ambiguous`` (or
        ``force``). Raises ``IterationAlreadyPostedError`` for a completed iteration unless ``force``
        is set, and ``PostInProgressError`` while another request posts the same review.
        """
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        if not isinstance(review.source, MRSource):
            raise PostNotSupportedForSourceError(
                f"Review {review_id} has source kind {review.source.kind!r}; "
                "posting comments back to the VCS is only supported for merge-request reviews."
            )

        host = await self._host_repo.get_by_id(review.host_id)
        if host is None:
            raise ValueError(f"Host {review.host_id} not found")

        idx = self._resolve_iteration_index(review, review_id, iteration_id)
        if idx is None:
            return PostReviewResult(review=review, iteration_id=None, results=[], skipped=0, completed=False)
        iteration = review.iterations[idx]
        _ensure_postable(iteration, force)

        run = _PostRun(
            provider=self._vcs_factory(host),
            recorder=_Recorder(self._review_repo, review_id, iteration.id),
            repo_path=review.repo_path,
            mr_iid=review.source.mr_iid,
            severity_label=severity_label,
            fallback_to_general_note=fallback_to_general_note,
        )
        options = _PostOptions(force=force, resend_ambiguous=resend_ambiguous, diff_refs=diff_refs)
        task = self._registry.start(review_id, self._post(run, review_id, iteration.id, options))
        # Shielded: if the client goes away the post still runs to the end and records every outcome.
        return await asyncio.shield(task)

    async def _post(
        self, run: _PostRun, review_id: UUID, iteration_id: UUID, options: _PostOptions
    ) -> PostReviewResult:
        # Read again now that this post is the only one for the review: a post that finished since
        # the request read it has recorded comments (or completed the iteration) that must not go twice.
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")
        iteration = review.iterations[find_iteration_index(review, iteration_id)]
        _ensure_postable(iteration, options.force)
        kept = [comment for comment in iteration.comments if comment.status == "kept"]
        if not kept:
            return PostReviewResult(review=review, iteration_id=iteration_id, results=[], skipped=0, completed=False)
        if options.force:
            pending = kept
        else:
            unposted = [comment for comment in kept if not comment.is_on_mr]
            pending = [c for c in unposted if options.resend_ambiguous or not (c.post and c.post.is_ambiguous)]
        try:
            results = await self._send(run, pending, options.diff_refs) if pending else []
            review = await run.recorder.finish()
        except Exception:
            logger.exception("Posting the comments of iteration %s failed", iteration_id)
            raise
        iteration = review.iterations[find_iteration_index(review, iteration_id)]
        on_mr = sum(1 for comment in kept if comment.is_on_mr)
        return PostReviewResult(
            review=review,
            iteration_id=iteration_id,
            results=results,
            skipped=0 if options.force else on_mr,
            held_back=len(kept) - len(pending) - (0 if options.force else on_mr),
            completed=iteration.completed_at is not None,
        )

    async def _send(
        self, run: _PostRun, pending: list[Comment], diff_refs: dict[str, str] | None
    ) -> list[CommentPostResult]:
        refs = diff_refs or await run.provider.get_diff_refs(run.repo_path, run.mr_iid)
        index = _anchor_index(await run.provider.get_diff(run.repo_path, run.mr_iid))
        plans = [_plan(comment, index, run.fallback_to_general_note) for comment in pending]
        order = {comment.id: position for position, comment in enumerate(pending)}

        results: list[CommentPostResult] = [
            await self._record(run, plan.comment, _failed(PostFailure(reason=plan.failure)))
            for plan in plans
            if plan.failure is not None
        ]

        inline = sorted(
            ((plan.comment, plan.anchor) for plan in plans if plan.anchor is not None),
            key=lambda item: (item[1].path, item[1].new_line),
        )
        notes = [plan for plan in plans if plan.anchor is None and plan.failure is None]
        refused = await self._send_inline(run, refs, inline, results)
        for comment, failure in refused:
            # Only a definitive refusal of the position may become a general note: after a timeout or a
            # 5xx the inline comment may exist, and a note would post it a second time.
            if run.fallback_to_general_note and failure.kind == "position_rejected":
                where = f"{comment.file}:{comment.line}"
                notes.append(_Plan(comment=comment, location=where, reason=f"inline comment refused: {failure.reason}"))
            else:
                results.append(await self._record(run, comment, _failed(failure)))
        results.extend([await self._send_note(run, plan) for plan in sorted(notes, key=lambda p: order[p.comment.id])])
        return results

    async def _send_inline(
        self,
        run: _PostRun,
        refs: dict[str, str],
        inline: list[tuple[Comment, LineAnchor]],
        results: list[CommentPostResult],
    ) -> list[tuple[Comment, PostFailure]]:
        """Post the inline comments, recording each one the host takes as it comes; return the others."""
        if not inline:
            return []
        drafts = [InlineComment(anchor=anchor, body=format_post_body(c, run.severity_label)) for c, anchor in inline]
        outcomes: list[PostResult] = []
        missing = PostFailure(reason="the host returned no result for this comment", kind="ambiguous")
        try:
            async for outcome in run.provider.post_inline_comments(run.repo_path, run.mr_iid, refs, drafts):
                if len(outcomes) == len(inline):
                    break
                comment = inline[len(outcomes)][0]
                outcomes.append(outcome)
                if isinstance(outcome, PostedNote):
                    post = CommentPost(outcome="inline", at=_now(), note_id=outcome.note_id, url=outcome.url)
                    results.append(await self._record(run, comment, post))
        except Exception as exc:
            # A bug in a provider must not lose the outcomes already recorded, nor hide the rest; what it
            # had sent before failing is unknown.
            logger.exception("Posting inline comments failed")
            missing = PostFailure(reason=f"unexpected error while posting: {exc}", kind="ambiguous")
        outcomes.extend([missing] * (len(inline) - len(outcomes)))
        return [
            (comment, outcome)
            for (comment, _anchor), outcome in zip(inline, outcomes, strict=True)
            if isinstance(outcome, PostFailure)
        ]

    async def _send_note(self, run: _PostRun, plan: _Plan) -> CommentPostResult:
        body = format_post_body(plan.comment, run.severity_label, plan.location)
        try:
            outcome = await run.provider.post_general_note(run.repo_path, run.mr_iid, body)
        except Exception as exc:
            logger.exception("Posting a general note failed")
            outcome = PostFailure(reason=f"unexpected error while posting: {exc}", kind="ambiguous")
        if isinstance(outcome, PostedNote):
            post = CommentPost(
                outcome="general_note", at=_now(), note_id=outcome.note_id, url=outcome.url, reason=plan.reason
            )
        else:
            reason = (
                outcome.reason
                if plan.reason is None
                else f"{plan.reason}; the general note failed too: {outcome.reason}"
            )
            post = _failed(PostFailure(reason=reason, kind=outcome.kind))
        return await self._record(run, plan.comment, post)

    @staticmethod
    async def _record(run: _PostRun, comment: Comment, post: CommentPost) -> CommentPostResult:
        await run.recorder.record(comment.id, post)
        return CommentPostResult(comment_id=comment.id, post=post)

    def _resolve_iteration_index(
        self,
        review: Review,
        review_id: UUID,
        iteration_id: UUID | None,
    ) -> int | None:
        if iteration_id is not None:
            idx = next((i for i, it in enumerate(review.iterations) if it.id == iteration_id), None)
            if idx is None:
                raise ValueError(f"Iteration {iteration_id} not found on review {review_id}")
            return idx
        return len(review.iterations) - 1 if review.iterations else None
