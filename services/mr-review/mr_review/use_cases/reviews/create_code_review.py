from __future__ import annotations

from uuid import UUID

from mr_review.core.reviews.entities import BriefConfig, Review
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.core.reviews.sources import BranchDiffSource


class CreateCodeReviewUseCase:
    """Create a review backed by an ad-hoc branch/commit diff (Phase 1).

    The use case is intentionally additive: it never touches MR-backed reviews.
    The output target for Phase 1 is in-app only — posting back to the VCS is
    explicitly out of scope and rejected by ``PostReviewUseCase``.
    """

    def __init__(self, repo: ReviewRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        host_id: UUID,
        repo_path: str,
        base_ref: str,
        head_ref: str,
        title: str = "",
        brief_config: BriefConfig | None = None,
    ) -> Review:
        source = BranchDiffSource(base_ref=base_ref, head_ref=head_ref, title=title)
        return await self._repo.create_from_source(
            host_id=host_id,
            repo_path=repo_path,
            source=source,
            brief_config=brief_config,
        )
