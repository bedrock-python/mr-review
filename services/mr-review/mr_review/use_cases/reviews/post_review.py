from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

import httpx

from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.reviews.entities import Comment, IterationStage, Review
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.core.vcs.protocols import VCSProvider, VCSProviderFactory

logger = logging.getLogger(__name__)


async def _post_one_comment(
    provider: VCSProvider,
    comment: Comment,
    repo_path: str,
    mr_iid: int,
    refs: dict[str, str],
    fallback_to_general_note: bool = True,
) -> bool:
    try:
        if comment.file is not None and comment.line is not None:
            await provider.post_inline_comment(
                repo_path=repo_path,
                mr_iid=mr_iid,
                diff_refs=refs,
                file=comment.file,
                line=comment.line,
                body=comment.body,
            )
        else:
            await provider.post_general_note(repo_path=repo_path, mr_iid=mr_iid, body=comment.body)
    except httpx.HTTPStatusError as exc:
        if not fallback_to_general_note:
            logger.warning(
                "Inline comment failed (%s %s), fallback disabled — skipping",
                exc.response.status_code,
                exc.response.text[:200],
            )
            return False
        logger.warning(
            "Inline comment failed (%s %s), falling back to general note",
            exc.response.status_code,
            exc.response.text[:200],
        )
        try:
            await provider.post_general_note(
                repo_path=repo_path,
                mr_iid=mr_iid,
                body=f"**{comment.file}:{comment.line}**\n\n{comment.body}",
            )
        except (httpx.HTTPStatusError, httpx.RequestError):
            logger.exception("Fallback general note also failed for comment %s", comment.id)
            return False
    return True


class PostReviewUseCase:
    def __init__(
        self,
        review_repo: ReviewRepository,
        host_repo: HostRepository,
        vcs_factory: VCSProviderFactory,
    ) -> None:
        self._review_repo = review_repo
        self._host_repo = host_repo
        self._vcs_factory = vcs_factory

    async def execute(
        self,
        review_id: UUID,
        diff_refs: dict[str, str] | None = None,
        iteration_id: UUID | None = None,
        fallback_to_general_note: bool = True,
    ) -> int:
        """Post kept comments from an iteration to the VCS. Returns count of successfully posted comments."""
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        host = await self._host_repo.get_by_id(review.host_id)
        if host is None:
            raise ValueError(f"Host {review.host_id} not found")

        idx = self._resolve_iteration_index(review, review_id, iteration_id)
        if idx is None:
            return 0

        iteration = review.iterations[idx]
        kept_comments = [c for c in iteration.comments if c.status == "kept"]
        if not kept_comments:
            return 0

        provider = self._vcs_factory(host)

        refs: dict[str, str] = diff_refs or {}
        if not refs:
            refs = await provider.get_diff_refs(review.repo_path, review.mr_iid)

        posted = await self._post_comments(
            provider, kept_comments, review.repo_path, review.mr_iid, refs, fallback_to_general_note
        )
        await self._complete_iteration(review, idx)
        return posted

    async def _post_comments(
        self,
        provider: VCSProvider,
        comments: list[Comment],
        repo_path: str,
        mr_iid: int,
        refs: dict[str, str],
        fallback_to_general_note: bool,
    ) -> int:
        posted = 0
        for comment in comments:
            if await _post_one_comment(provider, comment, repo_path, mr_iid, refs, fallback_to_general_note):
                posted += 1
        return posted

    async def _complete_iteration(self, review: Review, idx: int) -> None:
        completed_iteration = review.iterations[idx].model_copy(
            update={"stage": IterationStage.post, "completed_at": datetime.now(timezone.utc)}
        )
        new_iterations = list(review.iterations)
        new_iterations[idx] = completed_iteration
        await self._review_repo.update(review.model_copy(update={"iterations": new_iterations}))

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
