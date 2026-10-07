"""Turn VCS HTTP failures that escape a route into meaningful API responses instead of bare 500s."""

from __future__ import annotations

import httpx
import structlog
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

logger = structlog.get_logger(__name__)


def _is_rate_limited(response: httpx.Response) -> bool:
    # GitHub answers an exhausted (search) quota with 403 and X-RateLimit-Remaining: 0, the others with 429.
    return response.status_code == status.HTTP_429_TOO_MANY_REQUESTS or (
        response.status_code == status.HTTP_403_FORBIDDEN and response.headers.get("x-ratelimit-remaining") == "0"
    )


def vcs_status_error_to_http(exc: httpx.HTTPStatusError) -> tuple[int, str]:
    """Status code and detail for a VCS host's error answer."""
    upstream = exc.response.status_code
    if _is_rate_limited(exc.response):
        return status.HTTP_429_TOO_MANY_REQUESTS, "VCS rate limit reached — try again shortly"
    if upstream == status.HTTP_401_UNAUTHORIZED:
        return status.HTTP_401_UNAUTHORIZED, "VCS authentication failed — check your token"
    if upstream == status.HTTP_403_FORBIDDEN:
        return status.HTTP_403_FORBIDDEN, "VCS access denied — insufficient permissions"
    if upstream == status.HTTP_404_NOT_FOUND:
        return status.HTTP_404_NOT_FOUND, f"Not found on the VCS host: {exc.request.url.path}"
    return status.HTTP_502_BAD_GATEWAY, f"VCS returned {upstream}"


def vcs_request_error_to_http(exc: httpx.RequestError) -> tuple[int, str]:
    """Status code and detail for a VCS host that could not be reached or did not answer in time."""
    if isinstance(exc, httpx.TimeoutException):
        return status.HTTP_504_GATEWAY_TIMEOUT, f"VCS host timed out ({type(exc).__name__})"
    return status.HTTP_502_BAD_GATEWAY, f"VCS host unreachable ({type(exc).__name__})"


async def _on_vcs_error(request: Request, exc: Exception) -> JSONResponse:
    if isinstance(exc, httpx.HTTPStatusError):
        status_code, detail = vcs_status_error_to_http(exc)
        upstream: int | str = exc.response.status_code
    elif isinstance(exc, httpx.RequestError):
        status_code, detail = vcs_request_error_to_http(exc)
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
        status=status_code,
    )
    return JSONResponse(status_code=status_code, content={"detail": detail})


def register_vcs_error_handlers(app: FastAPI) -> None:
    """Map httpx errors raised anywhere in a route (VCS calls) to 401/403/404/429/502/504."""
    app.add_exception_handler(httpx.HTTPStatusError, _on_vcs_error)
    app.add_exception_handler(httpx.RequestError, _on_vcs_error)
