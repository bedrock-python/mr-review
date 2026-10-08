"""Turn VCS HTTP failures that escape a route into meaningful API responses instead of bare 500s."""

from __future__ import annotations

import time
from dataclasses import dataclass, field

import httpx
import structlog
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

logger = structlog.get_logger(__name__)


# Longest upstream message passed through in a detail; hosts can answer with whole HTML pages.
_MAX_UPSTREAM_MESSAGE = 300


@dataclass(frozen=True)
class VCSFailure:
    """What the API answers for a failed VCS call."""

    status_code: int
    detail: str
    headers: dict[str, str] = field(default_factory=dict)


def _upstream_message(response: httpx.Response) -> str:
    """Best-effort human message from a VCS error body (GitHub, GitLab, Gitea, Bitbucket shapes)."""
    try:
        body: object = response.json()
    except ValueError:
        return ""
    message: object = None
    if isinstance(body, dict):
        message = body.get("message") or body.get("error_description") or body.get("error")
        if isinstance(message, dict):  # Bitbucket: {"error": {"message": ...}}
            message = message.get("message")
    if not isinstance(message, str):
        return ""
    return message.strip()[:_MAX_UPSTREAM_MESSAGE]


def _retry_after(response: httpx.Response) -> str | None:
    """Seconds to wait as the host said it: Retry-After, or GitHub's X-RateLimit-Reset epoch."""
    retry_after = response.headers.get("retry-after")
    if retry_after and retry_after.strip().isdigit():
        return retry_after.strip()
    reset = response.headers.get("x-ratelimit-reset")
    if reset and reset.strip().isdigit():
        return str(max(0, int(reset) - int(time.time())))
    return None


def _is_rate_limited(response: httpx.Response) -> bool:
    if response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        return True
    if response.status_code != status.HTTP_403_FORBIDDEN:
        return False
    # GitHub answers both its primary quota (X-RateLimit-Remaining: 0) and its secondary limits
    # (Retry-After and/or a "secondary rate limit" message, quota not necessarily spent) with 403.
    if response.headers.get("x-ratelimit-remaining") == "0" or "retry-after" in response.headers:
        return True
    return "rate limit" in _upstream_message(response).lower()


def vcs_status_error_to_http(exc: httpx.HTTPStatusError) -> VCSFailure:
    """Status code, detail and headers for a VCS host's error answer."""
    response = exc.response
    upstream = response.status_code
    if _is_rate_limited(response):
        retry_after = _retry_after(response)
        return VCSFailure(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "VCS rate limit reached — try again shortly",
            {"Retry-After": retry_after} if retry_after is not None else {},
        )
    if upstream == status.HTTP_401_UNAUTHORIZED:
        return VCSFailure(status.HTTP_401_UNAUTHORIZED, "VCS authentication failed — check your token")
    if upstream == status.HTTP_403_FORBIDDEN:
        return VCSFailure(status.HTTP_403_FORBIDDEN, "VCS access denied — insufficient permissions")
    if upstream == status.HTTP_404_NOT_FOUND:
        return VCSFailure(status.HTTP_404_NOT_FOUND, f"Not found on the VCS host: {exc.request.url.path}")
    if upstream in (status.HTTP_400_BAD_REQUEST, status.HTTP_422_UNPROCESSABLE_CONTENT):
        # The host refused what was asked (a bad ref, an unsupported query): retrying won't help.
        message = _upstream_message(response)
        detail = f"VCS rejected the request ({upstream})" + (f": {message}" if message else "")
        return VCSFailure(upstream, detail)
    return VCSFailure(status.HTTP_502_BAD_GATEWAY, f"VCS returned {upstream}")


def vcs_request_error_to_http(exc: httpx.RequestError) -> VCSFailure:
    """Status code and detail for a VCS host that could not be reached or did not answer in time."""
    if isinstance(exc, httpx.TimeoutException):
        return VCSFailure(status.HTTP_504_GATEWAY_TIMEOUT, f"VCS host timed out ({type(exc).__name__})")
    return VCSFailure(status.HTTP_502_BAD_GATEWAY, f"VCS host unreachable ({type(exc).__name__})")


async def _on_vcs_error(request: Request, exc: Exception) -> JSONResponse:
    if isinstance(exc, httpx.HTTPStatusError):
        failure = vcs_status_error_to_http(exc)
        upstream: int | str = exc.response.status_code
    elif isinstance(exc, httpx.RequestError):
        failure = vcs_request_error_to_http(exc)
        upstream = type(exc).__name__
    else:
        # Only registered for httpx errors; anything else is a programming error worth surfacing.
        raise exc
    try:
        vcs_url: httpx.URL | None = exc.request.url
    except RuntimeError:  # an error raised without the request attached
        vcs_url = None
    # Host and path only: query strings may carry user input (credentials never travel in the URL).
    logger.warning(
        "VCS request failed",
        route=request.url.path,
        vcs_host=vcs_url.host if vcs_url else None,
        vcs_path=vcs_url.path if vcs_url else None,
        upstream=upstream,
        status=failure.status_code,
    )
    return JSONResponse(
        status_code=failure.status_code, content={"detail": failure.detail}, headers=failure.headers or None
    )


def register_vcs_error_handlers(app: FastAPI) -> None:
    """Map httpx errors raised anywhere in a route (VCS calls) to 400/401/403/404/422/429/502/504."""
    app.add_exception_handler(httpx.HTTPStatusError, _on_vcs_error)
    app.add_exception_handler(httpx.RequestError, _on_vcs_error)
