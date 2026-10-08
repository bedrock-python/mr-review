from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Sequence
from typing import TYPE_CHECKING, Protocol
from uuid import UUID

from mr_review.core.mrs.entities import MR, DiffFile, InboxMR, MRStateFilter, PersonalMRScope, Repo
from mr_review.core.pagination import DEFAULT_MRS_PER_PAGE, DEFAULT_REPOS_PER_PAGE, Page
from mr_review.core.vcs.entities import InlineComment, PostResult

if TYPE_CHECKING:
    from mr_review.core.hosts.entities import Host


class VCSProvider(Protocol):
    async def test_connection(self) -> dict[str, str]: ...

    async def list_repos(
        self, query: str | None = None, page: int = 1, per_page: int = DEFAULT_REPOS_PER_PAGE
    ) -> Page[Repo]:
        """One page of the repositories the token can see, most recently active first."""
        ...

    async def get_repo(self, repo_path: str) -> Repo: ...

    async def list_mrs(
        self,
        repo_path: str,
        state: MRStateFilter = "opened",
        page: int = 1,
        per_page: int = DEFAULT_MRS_PER_PAGE,
        query: str | None = None,
    ) -> Page[MR]:
        """One page of a repository's MRs, most recently updated first; ``query`` searches titles."""
        ...

    async def list_my_mrs(
        self, scope: PersonalMRScope, page: int = 1, per_page: int = DEFAULT_MRS_PER_PAGE
    ) -> Page[InboxMR]:
        """One page of open MRs across repositories that the token's user authored, is assigned or reviews."""
        ...

    async def get_mr(self, repo_path: str, mr_iid: int) -> MR: ...

    async def get_diff(self, repo_path: str, mr_iid: int) -> list[DiffFile]: ...

    async def get_branch_diff(self, repo_path: str, base_ref: str, head_ref: str) -> list[DiffFile]: ...

    async def get_file(self, repo_path: str, file_path: str, ref: str = "HEAD") -> str | None: ...

    async def list_directory(self, repo_path: str, dir_path: str, ref: str = "HEAD") -> list[str]: ...

    async def get_commits(
        self, repo_path: str, file_path: str, ref: str = "HEAD", limit: int = 10
    ) -> list[dict[str, str]]: ...

    async def get_diff_refs(self, repo_path: str, mr_iid: int) -> dict[str, str]: ...

    def post_inline_comments(
        self,
        repo_path: str,
        mr_iid: int,
        diff_refs: dict[str, str],
        comments: Sequence[InlineComment],
    ) -> AsyncIterator[PostResult]:
        """Post inline comments, yielding one result per comment, in order, as soon as it is known.

        A host with a review API posts them as one review. A host error is a ``PostFailure`` for the
        comments it concerns, never an exception, so the caller can record each outcome as it comes.
        """
        ...

    async def post_general_note(self, repo_path: str, mr_iid: int, body: str) -> PostResult:
        """Post an MR-level note; a host error is returned as a ``PostFailure``."""
        ...


class VCSCacheInvalidator(Protocol):
    def invalidate(self, host_id: UUID, repo_path: str | None = None) -> None:
        """Forget cached VCS responses for a host — only one repository's when ``repo_path`` is given."""
        ...


# Factory that produces a VCSProvider for a given Host.
VCSProviderFactory = Callable[["Host"], "VCSProvider"]
