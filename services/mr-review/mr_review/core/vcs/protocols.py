from __future__ import annotations

from typing import Protocol

from mr_review.core.mrs.entities import MR, DiffFile, Repo


class VCSProvider(Protocol):
    async def test_connection(self) -> dict[str, str]: ...

    async def list_repos(self, query: str | None = None) -> list[Repo]: ...

    async def list_mrs(self, repo_path: str, state: str = "opened") -> list[MR]: ...

    async def get_mr(self, repo_path: str, mr_iid: int) -> MR: ...

    async def get_diff(self, repo_path: str, mr_iid: int) -> list[DiffFile]: ...

    async def post_inline_comment(
        self,
        repo_path: str,
        mr_iid: int,
        diff_refs: dict[str, str],
        file: str,
        line: int,
        body: str,
    ) -> None: ...

    async def post_general_note(self, repo_path: str, mr_iid: int, body: str) -> None: ...
