from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.reviews.entities import BriefConfig
from mr_review.core.reviews.path_filter import ExcludedFile, PathFilter
from mr_review.core.reviews.repositories import ReviewRepository
from mr_review.core.vcs.protocols import VCSProviderFactory
from mr_review.use_cases.reviews.source_resolver import resolve_source


@dataclass(frozen=True, slots=True)
class FileSelection:
    total: int
    excluded: tuple[ExcludedFile, ...]


class ListExcludedFilesUseCase:
    """Which of the review's changed files a brief's path filters leave out — the diff alone, no context."""

    def __init__(
        self, review_repo: ReviewRepository, host_repo: HostRepository, vcs_factory: VCSProviderFactory
    ) -> None:
        self._review_repo = review_repo
        self._host_repo = host_repo
        self._vcs_factory = vcs_factory

    async def execute(self, review_id: UUID, brief_config: BriefConfig | None = None) -> FileSelection:
        review = await self._review_repo.get_by_id(review_id)
        if review is None:
            raise ValueError(f"Review {review_id} not found")
        host = await self._host_repo.get_by_id(review.host_id)
        if host is None:
            raise ValueError(f"Host {review.host_id} not found")

        resolved = await resolve_source(review, self._vcs_factory(host))
        _, excluded = PathFilter.from_brief(brief_config or review.brief_config).split(resolved.diff_files)
        return FileSelection(total=len(resolved.diff_files), excluded=tuple(excluded))
