"""Claude through the Anthropic Messages API, streamed.

The request carries only what the plan allows (see ``plan_generation``): adaptive thinking with
``output_config.effort`` on current models, a ``budget_tokens`` thinking budget on older ones,
``temperature`` only where accepted, and ``output_config.format`` for structured output. A client
lives for one call and is closed with it.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator, AsyncIterator
from typing import Final, Literal

import anthropic
import httpx2
from anthropic import Omit, omit
from anthropic.types import Message, OutputConfigParam, ThinkingConfigParam

from mr_review.core.ai.capabilities import DEFAULT_MAX_OUTPUT_TOKENS, is_vendor_endpoint
from mr_review.core.ai.entities import AIStreamEnd, AIStreamItem, GenerationPlan
from mr_review.core.ai.errors import AIProviderRefusalError
from mr_review.core.ai.review_format import REVIEW_COMMENTS_SCHEMA
from mr_review.infra.ai._sdk_errors import SdkErrorTypes, to_provider_error

ClaudeEffort = Literal["low", "medium", "high", "xhigh", "max"]

_PROVIDER: Final = "Claude"
# The answer stopped short: at max_tokens, or because the context window filled up.
_TRUNCATING_STOP_REASONS: Final = frozenset({"max_tokens", "model_context_window_exceeded"})
# The plan only names levels the model has; this narrows the shared type to Claude's.
_CLAUDE_EFFORTS: Final[dict[str, ClaudeEffort]] = {
    "low": "low",
    "medium": "medium",
    "high": "high",
    "xhigh": "xhigh",
    "max": "max",
}
_ERRORS: Final = SdkErrorTypes(
    timeout=anthropic.APITimeoutError,
    connection=anthropic.APIConnectionError,
    auth=(anthropic.AuthenticationError, anthropic.PermissionDeniedError),
    bad_request=anthropic.BadRequestError,
    not_found=anthropic.NotFoundError,
)


def _thinking(plan: GenerationPlan) -> ThinkingConfigParam | Omit:
    if plan.thinking == "budget" and plan.budget_tokens is not None:
        return {"type": "enabled", "budget_tokens": plan.budget_tokens}
    if plan.thinking == "adaptive":
        return {"type": "adaptive"}
    return omit


def _output_config(plan: GenerationPlan) -> OutputConfigParam | Omit:
    config: OutputConfigParam = {}
    effort = _CLAUDE_EFFORTS.get(plan.effort) if plan.effort is not None else None
    if effort is not None and plan.thinking == "adaptive":
        config["effort"] = effort
    if plan.structured_output:
        config["format"] = {"type": "json_schema", "schema": REVIEW_COMMENTS_SCHEMA}
    return config or omit


def _extra_body(plan: GenerationPlan) -> dict[str, object] | None:
    # anthropic 1.x dropped the sampling parameters from its signatures; the API still takes
    # temperature on the models the plan sends it to.
    return {"temperature": plan.temperature} if plan.temperature is not None else None


def _refusal(message: Message) -> AIProviderRefusalError:
    details = message.stop_details
    reason = "Claude declined to complete the review"
    if details is not None and details.category:
        reason += f" (category: {details.category})"
    if details is not None and details.explanation:
        reason += f": {details.explanation}"
    return AIProviderRefusalError(f"{reason}. What it wrote before stopping was kept.")


def sdk_base_url(base_url: str | None) -> str | None:
    """The base URL to hand the SDK, which appends ``/v1/messages`` itself.

    Blank, or Anthropic's own host, means the SDK default. A trailing ``/v1`` — the form an OpenAI
    endpoint or a copied ``https://api.anthropic.com/v1`` takes — is dropped so the path is not
    doubled.
    """
    url = (base_url or "").strip().rstrip("/")
    url = url.removesuffix("/v1").rstrip("/")
    if not url or is_vendor_endpoint("claude", url):
        return None
    return url


class ClaudeProvider:
    def __init__(
        self,
        api_key: str,
        *,
        base_url: str | None = None,
        ssl_verify: bool = True,
        timeout: int = 60,
        transport: httpx2.AsyncBaseTransport | None = None,
    ) -> None:
        self._api_key = api_key
        # An empty base URL means Anthropic's own endpoint; a set one reaches a gateway (LiteLLM, a proxy).
        self._base_url = sdk_base_url(base_url)
        self._ssl_verify = ssl_verify
        self._timeout = timeout
        self._transport = transport

    def _client(self) -> anthropic.AsyncAnthropic:
        return anthropic.AsyncAnthropic(
            api_key=self._api_key,
            base_url=self._base_url,
            http_client=anthropic.DefaultAsyncHttpxClient(
                verify=self._ssl_verify, timeout=float(self._timeout), transport=self._transport
            ),
        )

    async def list_models(self) -> list[str]:
        """Every model the key can use, newest first, across all pages."""
        async with self._client() as client:
            try:
                return [model.id async for model in client.models.list()]
            except anthropic.APIError as exc:
                raise to_provider_error(exc, _ERRORS, provider=_PROVIDER) from exc

    def dispatch(self, prompt: str, plan: GenerationPlan) -> AsyncIterator[AIStreamItem]:
        return self._stream(prompt, plan)

    async def _stream(self, prompt: str, plan: GenerationPlan) -> AsyncGenerator[AIStreamItem, None]:
        async with self._client() as client:
            try:
                async with client.messages.stream(
                    model=plan.model,
                    max_tokens=plan.max_output_tokens or DEFAULT_MAX_OUTPUT_TOKENS,
                    system=plan.system_prompt,
                    messages=[{"role": "user", "content": prompt}],
                    thinking=_thinking(plan),
                    output_config=_output_config(plan),
                    extra_body=_extra_body(plan),
                ) as stream:
                    async for text in stream.text_stream:
                        yield text
                    final = await stream.get_final_message()
            except anthropic.APIError as exc:
                raise to_provider_error(
                    exc, _ERRORS, provider=_PROVIDER, structured_output=plan.structured_output
                ) from exc
        if final.stop_reason == "refusal":
            raise _refusal(final)
        yield AIStreamEnd(truncated=final.stop_reason in _TRUNCATING_STOP_REASONS)
