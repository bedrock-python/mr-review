from __future__ import annotations

import logging
from uuid import UUID

import httpx

from mr_review.core.reviews.entities import Comment, ReviewStage
from mr_review.core.vcs.protocols import VCSProvider
from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.repositories.review import FileReviewRepository
from mr_review.infra.vcs.factory import create_vcs_provider

logger = logging.getLogger(__name__)


async def _post_one_comment(
    provider: "VCSProvider",
    comment: Comment,
    repo_path: str,
    mr_iid: int,
    refs: dict[str, str],
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
        except Exception:
            logger.exception("Fallback general note also failed for comment %s", comment.id)
            return False
    return True


class PostReviewUseCase:
    def __init__(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
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
                if await _post_one_comment(provider, comment, review.repo_path, review.mr_iid, refs):
                    posted += 1

        updated = review.model_copy(update={"stage": ReviewStage.post})
        await self._review_repo.update(updated)

        return posted
