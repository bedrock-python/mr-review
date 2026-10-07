"""Translating the Anthropic and OpenAI SDK exceptions into ``AIProviderError``.

Both SDKs share one exception layout, so one translation serves both; each backend names its own
classes in an ``SdkErrorTypes``.
"""

from __future__ import annotations

from dataclasses import dataclass

from mr_review.core.ai.errors import AIProviderAuthError, AIProviderError, AIProviderTimeoutError

_MAX_DETAIL = 500


@dataclass(frozen=True, slots=True)
class SdkErrorTypes:
    timeout: type[Exception]
    connection: type[Exception]
    auth: tuple[type[Exception], ...]
    bad_request: type[Exception]
    not_found: type[Exception]


def _detail(exc: Exception) -> str:
    """The provider's own error message when its body carries one, else the SDK's."""
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        error = body.get("error", body)
        if isinstance(error, dict) and isinstance(error.get("message"), str):
            return str(error["message"])[:_MAX_DETAIL]
    return (getattr(exc, "message", None) or str(exc) or type(exc).__name__)[:_MAX_DETAIL]


def _connection_detail(exc: Exception) -> str:
    cause = exc.__cause__
    return f"{type(cause).__name__}: {cause}" if cause is not None else str(exc)


def _status_error(exc: Exception, types: SdkErrorTypes, *, provider: str, structured_output: bool) -> AIProviderError:
    status = getattr(exc, "status_code", None)
    detail = _detail(exc)
    if isinstance(exc, types.auth):
        return AIProviderAuthError(f"{provider} rejected the API key ({status}): {detail}")
    if isinstance(exc, types.bad_request) and structured_output:
        return AIProviderError(
            f"{provider} rejected the request: {detail} — structured output was on; if this model or "
            "endpoint does not support it, turn Structured output off and retry"
        )
    if isinstance(exc, types.not_found):
        return AIProviderError(f"{provider} answered 404: {detail} — check the model name and the base URL")
    if status is not None:
        return AIProviderError(f"{provider} answered {status}: {detail}")
    return AIProviderError(f"{provider} request failed: {detail}")


def to_provider_error(
    exc: Exception, types: SdkErrorTypes, *, provider: str, structured_output: bool = False
) -> AIProviderError:
    """An ``AIProviderError`` whose message says what went wrong and, where it can, what to change."""
    if isinstance(exc, types.timeout):
        return AIProviderTimeoutError(f"{provider} did not answer in time — retry, or raise the provider's timeout")
    if isinstance(exc, types.connection):
        return AIProviderError(f"Could not reach {provider} ({_connection_detail(exc)}) — check the base URL")
    return _status_error(exc, types, provider=provider, structured_output=structured_output)
