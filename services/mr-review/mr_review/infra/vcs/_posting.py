"""Helpers the VCS providers share when posting comments."""

from __future__ import annotations

from collections import defaultdict, deque
from collections.abc import Iterable, Sequence
from typing import Any

import httpx

from mr_review.core.vcs.entities import InlineComment, PostedNote, PostFailure, PostFailureKind

_MAX_REASON_CHARS = 300


def _error_parts(data: dict[str, Any]) -> list[str]:
    # Bitbucket nests the error; GitLab may put a dict or a list in "message"; GitHub adds "errors".
    error = data.get("error")
    if isinstance(error, dict):
        data = error
    parts = [str(value) for key in ("message", "detail") if (value := data.get(key))]
    parts.extend(
        str(item.get("message") or item.get("code") or item) if isinstance(item, dict) else str(item)
        for item in data.get("errors") or []
    )
    return parts


def _host_message(response: httpx.Response) -> str:
    """The error text a host put in its response body."""
    try:
        data: Any = response.json()
    except ValueError:
        return response.text.strip()
    if not isinstance(data, dict):
        return str(data)
    return "; ".join(_error_parts(data)) or response.text.strip()


def _shorten(text: str) -> str:
    return text if len(text) <= _MAX_REASON_CHARS else text[: _MAX_REASON_CHARS - 1] + "…"


def describe_status_error(exc: httpx.HTTPStatusError) -> str:
    """``"<status> <phrase>: <host's message>"``, kept short."""
    response = exc.response
    message = _host_message(response)
    reason = f"{response.status_code} {response.reason_phrase}".strip()
    return _shorten(f"{reason}: {message}" if message else reason)


def describe_http_error(exc: httpx.HTTPError) -> str:
    """A short reason for any failed request: the host's answer, or what went wrong on the way."""
    if isinstance(exc, httpx.HTTPStatusError):
        return describe_status_error(exc)
    return f"{type(exc).__name__} talking to the host"


def mentions_position(exc: httpx.HTTPStatusError, *words: str) -> bool:
    """Whether the host's error text names the comment's place in the diff (any of ``words``)."""
    text = exc.response.text.lower()
    return any(word in text for word in words)


def ambiguous(reason: str) -> PostFailure:
    return PostFailure(
        reason=_shorten(f"{reason}; the host may have posted it anyway, check the MR before retrying"),
        kind="ambiguous",
    )


def failure_from(exc: httpx.HTTPError, *, position_rejected: bool = False) -> PostFailure:
    """What a failed request means for the comment it carried.

    A 4xx is a definitive refusal: of the comment's position when ``position_rejected`` (the caller
    knows how its host says so), otherwise of something else. A 5xx, a timeout or a dropped
    connection says nothing about whether the comment was created, so it is ``ambiguous``; a
    request that never left (no connection) is a plain refusal.
    """
    if isinstance(exc, httpx.HTTPStatusError):
        if exc.response.status_code >= httpx.codes.INTERNAL_SERVER_ERROR:
            return ambiguous(describe_status_error(exc))
        kind: PostFailureKind = "position_rejected" if position_rejected else "rejected"
        return PostFailure(reason=describe_status_error(exc), kind=kind)
    if isinstance(exc, _NOT_SENT):
        return PostFailure(reason=f"could not reach the host ({type(exc).__name__}); nothing was sent")
    return ambiguous(f"{type(exc).__name__} talking to the host")


# Failures that happen before a request leaves: the host never saw it.
_NOT_SENT = (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout, httpx.UnsupportedProtocol)


def match_review_comments(
    comments: Sequence[InlineComment],
    created: Iterable[dict[str, Any]],
    fallback: PostedNote,
) -> list[PostedNote]:
    """Pair each posted comment with the review comment the host created for it (same path and body).

    A comment without a match gets ``fallback`` (the review itself), so it still counts as posted.
    """
    by_key: defaultdict[tuple[str, str], deque[dict[str, Any]]] = defaultdict(deque)
    for item in created:
        by_key[(str(item.get("path", "")), str(item.get("body", "")))].append(item)
    notes: list[PostedNote] = []
    for comment in comments:
        candidates = by_key.get((comment.anchor.path, comment.body))
        if not candidates:
            notes.append(fallback)
            continue
        item = candidates.popleft()
        url = item.get("html_url")
        notes.append(PostedNote(note_id=str(item["id"]), url=str(url) if url else fallback.url))
    return notes
