from uuid import UUID

import httpx

from mr_review.infra.repositories.host import FileHostRepository
from mr_review.infra.repositories.review import FileReviewRepository
from mr_review.infra.vcs.factory import create_vcs_provider
from mr_review.use_cases.reviews.dispatch_review import _build_prompt, _format_diff


class GetReviewPromptUseCase:
    def __init__(
        self,
        review_repo: FileReviewRepository,
        host_repo: FileHostRepository,
    ) -> None:
        self._review_repo = review_repo
        self._host_repo = host_repo

    async def execute(self, review_id: UUID, *, exclude_diff: bool = False) -> str:
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        host = await self._host_repo.get_by_id(review.host_id)
        if host is None:
            raise ValueError(f"Host {review.host_id} not found")

        async with httpx.AsyncClient(timeout=60) as client:
            provider = create_vcs_provider(host, client)
            mr = await provider.get_mr(repo_path=review.repo_path, mr_iid=review.mr_iid)
            diff_files = await provider.get_diff(repo_path=review.repo_path, mr_iid=review.mr_iid)

        diff_text = _format_diff(diff_files)

        if exclude_diff:
            patched = review.model_copy(
                update={"brief_config": review.brief_config.model_copy(update={"include_diff": False})}
            )
            prompt = _build_prompt(patched, diff_text, mr.title, mr.description)
            suffix = (
                "\n\n## Diff\n\nThe diff is too large to embed and is provided as a separate"
                " file (`review.diff`). Please refer to it for all code changes."
            )
            return prompt + suffix

        return _build_prompt(review, diff_text, mr.title, mr.description)
