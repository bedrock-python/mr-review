"""Turn AI provider failures that escape a route into meaningful API responses instead of bare 500s."""

from __future__ import annotations

import structlog
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from mr_review.core.ai.errors import AIProviderAuthError, AIProviderError, AIProviderTimeoutError

logger = structlog.get_logger(__name__)


def ai_provider_error_to_http(exc: AIProviderError) -> tuple[int, str]:
    """Status code and detail: 401 for a rejected key, 504 for a timeout, 502 for anything else upstream."""
    if isinstance(exc, AIProviderAuthError):
        return status.HTTP_401_UNAUTHORIZED, str(exc)
    if isinstance(exc, AIProviderTimeoutError):
        return status.HTTP_504_GATEWAY_TIMEOUT, str(exc)
    return status.HTTP_502_BAD_GATEWAY, str(exc)


async def _on_ai_provider_error(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, AIProviderError):
        # Only registered for AIProviderError; anything else is a programming error worth surfacing.
        raise exc
    status_code, detail = ai_provider_error_to_http(exc)
    logger.warning("AI provider request failed", route=request.url.path, status=status_code, error=detail)
    return JSONResponse(status_code=status_code, content={"detail": detail})


def register_ai_error_handlers(app: FastAPI) -> None:
    """Map ``AIProviderError`` raised anywhere in a route (model listing, previews) to 401/502/504."""
    app.add_exception_handler(AIProviderError, _on_ai_provider_error)
