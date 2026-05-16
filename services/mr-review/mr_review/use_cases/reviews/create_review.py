from __future__ import annotations

from uuid import UUID

from mr_review.core.reviews.entities import BriefConfig, Review
from mr_review.infra.repositories.review import FileReviewRepository


class CreateReviewUseCase:
    def __init__(self, repo: FileReviewRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        host_id: UUID,
        repo_path: str,
        mr_iid: int,
        brief_config: BriefConfig | None = None,
    ) -> Review:
        existing = await self._repo.get_by_mr(host_id=host_id, repo_path=repo_path, mr_iid=mr_iid)
        if existing is not None:
            return existing
        return await self._repo.create(
            host_id=host_id,
            repo_path=repo_path,
            mr_iid=mr_iid,
            brief_config=brief_config,
        )
