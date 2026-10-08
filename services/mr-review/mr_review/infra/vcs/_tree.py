"""Directory listings for hosts whose API returns a repository's whole tree at once."""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class WholeTreeListing(Protocol):
    """A provider that can only list a directory by fetching the whole recursive tree.

    The caching layer fetches that tree once per (repository, ref) and answers every
    directory listing from it, instead of downloading the tree again for each directory.
    """

    async def list_tree(self, repo_path: str, ref: str = "HEAD") -> list[str]:
        """Every file path in the repository at ``ref``."""
        ...


def files_under(tree: list[str], dir_path: str) -> list[str]:
    """The files of ``tree`` below ``dir_path``, at any depth."""
    prefix = dir_path.rstrip("/") + "/"
    return [path for path in tree if path.startswith(prefix)]
