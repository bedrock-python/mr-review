"""Page-number pagination shared by every listing that talks to a VCS host."""

from pydantic import BaseModel

MAX_PER_PAGE = 100
DEFAULT_REPOS_PER_PAGE = 50
DEFAULT_MRS_PER_PAGE = 30


class Page[T](BaseModel):
    """One page of a listing.

    ``page`` is 1-based. ``has_more`` comes from the host's own "there is a next
    page" signal, so a page may hold fewer than ``per_page`` items — even none —
    while ``has_more`` is still true (e.g. when items are filtered after the
    upstream page was fetched).
    """

    items: list[T]
    page: int
    per_page: int
    has_more: bool
