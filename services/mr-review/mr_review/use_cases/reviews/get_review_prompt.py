from __future__ import annotations

from uuid import UUID

from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.review_presets.repositories import ReviewPresetRepository
from mr_review.core.reviews.entities import BriefConfig, Iteration, Review
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.core.vcs.protocols import VCSProviderFactory
from mr_review.use_cases.reviews.prompt_assembly import AssembledPrompt, assemble_prompt, dispatch_target_number


class GetReviewPromptUseCase:
    """The prompt a dispatch would send, built exactly as dispatch builds it, without calling a model."""

    def __init__(
        self,
        review_repo: ReviewRepository,
        host_repo: HostRepository,
        vcs_factory: VCSProviderFactory,
        preset_repo: ReviewPresetRepository | None = None,
    ) -> None:
        self._review_repo = review_repo
        self._host_repo = host_repo
        self._vcs_factory = vcs_factory
        self._preset_repo = preset_repo

    async def execute(
        self,
        review_id: UUID,
        *,
        brief_config: BriefConfig | None = None,
        iteration_id: UUID | None = None,
    ) -> AssembledPrompt:
        """``brief_config`` previews a brief that is not saved yet; without it the iteration's own is used."""
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")

        host = await self._host_repo.get_by_id(review.host_id)
        if host is None:
            raise ValueError(f"Host {review.host_id} not found")

        iteration = self._find_iteration(review, iteration_id)
        config = brief_config or (iteration.brief_config if iteration is not None else review.brief_config)
        return await assemble_prompt(
            review,
            self._vcs_factory(host),
            config,
            iteration_number=dispatch_target_number(review, iteration),
            presets=self._preset_repo,
        )

    @staticmethod
    def _find_iteration(review: Review, iteration_id: UUID | None) -> Iteration | None:
        if iteration_id is None:
            return None
        iteration = next((it for it in review.iterations if it.id == iteration_id), None)
        if iteration is None:
            raise ValueError(f"Iteration {iteration_id} not found on review {review.id}")
        return iteration
