"""Helpers shared by the VCS providers for page-number pagination."""

from __future__ import annotations

from typing import Any

import httpx

from mr_review.core.mrs.entities import MR


def has_next_link(response: httpx.Response) -> bool:
    """True when the response's ``Link`` header advertises a ``rel="next"`` page."""
    return "next" in response.links


def gitlab_has_more(response: httpx.Response, item_count: int, per_page: int) -> bool:
    """GitLab sends ``X-Next-Page`` (empty on the last page); fall back to a full page when it is absent."""
    next_page = response.headers.get("x-next-page")
    if next_page is not None:
        return bool(next_page.strip())
    return item_count >= per_page


def gitea_has_more(response: httpx.Response, item_count: int, per_page: int) -> bool:
    """Gitea/Forgejo: ``X-HasMore`` where the endpoint sets it, then ``Link``, then a full page."""
    has_more = response.headers.get("x-hasmore")
    if has_more is not None:
        return has_more.strip().lower() == "true"
    if "link" in response.headers:
        return has_next_link(response)
    return item_count >= per_page


def json_list(response: httpx.Response) -> list[dict[str, Any]]:
    """Decode a JSON array body; anything else (an error object, null) is treated as empty."""
    data: Any = response.json()
    return data if isinstance(data, list) else []


def filter_by_title(mrs: list[MR], query: str | None) -> list[MR]:
    """Case-insensitive title filter, for hosts whose MR listing cannot search titles itself."""
    if not query:
        return mrs
    needle = query.lower()
    return [mr for mr in mrs if needle in mr.title.lower()]


def optional_str(value: object) -> str | None:
    """A non-empty string reported by a host, or ``None``."""
    return str(value) if value else None


def optional_int(value: object) -> int | None:
    """Coerce a count reported by a host to ``int``; ``None`` (or garbage) when it was not reported.

    GitLab reports ``changes_count`` as a string and caps it as ``"1000+"``.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    text = str(value).strip().rstrip("+")
    return int(text) if text.isdigit() else None
