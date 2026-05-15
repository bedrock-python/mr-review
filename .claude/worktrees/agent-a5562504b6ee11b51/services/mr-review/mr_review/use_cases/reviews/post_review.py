from __future__ import annotations

import logging
from uuid import UUID

import httpx

from mr_review.core.reviews.entities import ReviewStage
from mr_review.infra.repositories.host import SQLiteHostRepository
from mr_review.infra.repositories.review import SQLiteReviewRepository
from mr_review.infra.vcs.factory import create_vcs_provider

logger = logging.getLogger(__name__)


class PostReviewUseCase:
    def __init__(
        self,
        review_repo: SQLiteReviewRepository,
        host_repo: SQLiteHostRepository,
    ) -> None:
        self._review_repo = review_repo
        self._host_repo = host_repo

    async def execute(self, review_id: UUID, diff_refs: dict[str, str] | None = None) -> int:
        """Post kept comments to the VCS. Returns count of successfully posted comments."""
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        host = await self._host_repo.get_by_id(review.host_id)
        if host is None:
            raise ValueError(f"Host {review.host_id} not found")

        kept_comments = [c for c in review.comments if c.status == "kept"]
        if not kept_comments:
            return 0

        refs: dict[str, str] = diff_refs or {}
        posted = 0

        async with httpx.AsyncClient(timeout=30) as client:
            provider = create_vcs_provider(host, client)

            for comment in kept_comments:
                try:
                    if comment.file is not None and comment.line is not None:
                        await provider.post_inline_comment(
                            repo_path=review.repo_path,
                            mr_iid=review.mr_iid,
                            diff_refs=refs,
                            file=comment.file,
                            line=comment.line,
                            body=comment.body,
                        )
                    else:
                        await provider.post_general_note(
                            repo_path=review.repo_path,
                            mr_iid=review.mr_iid,
                            body=comment.body,
                        )
                    posted += 1
                except httpx.HTTPStatusError as exc:
                    # Inline comment failed (e.g. line not in diff) — fall back to general note
                    logger.warning(
                        "Inline comment failed (%s %s), falling back to general note",
                        exc.response.status_code,
                        exc.response.text[:200],
                    )
                    try:
                        await provider.post_general_note(
                            repo_path=review.repo_path,
                            mr_iid=review.mr_iid,
                            body=f"**{comment.file}:{comment.line}**\n\n{comment.body}",
                        )
                        posted += 1
                    except Exception:
                        logger.exception("Fallback general note also failed for comment %s", comment.id)

        # Transition to post stage
        updated = review.model_copy(update={"stage": ReviewStage.post})
        await self._review_repo.update(updated)

        return posted
