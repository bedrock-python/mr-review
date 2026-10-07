from __future__ import annotations

from uuid import UUID

from mr_review.core.reviews.entities import BriefConfig, Review
from mr_review.core.reviews.repositories import ReviewRepository


class CreateReviewUseCase:
    def __init__(self, repo: ReviewRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        host_id: UUID,
        repo_path: str,
        mr_iid: int,
        brief_config: BriefConfig | None = None,
    ) -> Review:
        # One review per MR, found or created atomically: two quick "start review" clicks
        # get the same review instead of two.
        return await self._repo.get_or_create_by_mr(
            host_id=host_id,
            repo_path=repo_path,
            mr_iid=mr_iid,
            brief_config=brief_config,
        )
