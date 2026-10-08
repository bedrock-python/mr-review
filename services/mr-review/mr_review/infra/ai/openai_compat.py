"""OpenAI chat completions — OpenAI itself or any compatible endpoint — streamed.

The output limit goes out as ``max_completion_tokens`` to OpenAI, which requires it for reasoning
models, and as ``max_tokens`` to compatible endpoints, the one name every such server (Ollama,
vLLM, LM Studio, llama.cpp, LiteLLM, Groq) understands. ``reasoning_effort`` is the documented
top-level parameter; a thinking budget, which has no standard parameter, goes out as
``reasoning_budget`` for the servers that read it. A client lives for one call and is closed with it.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator, AsyncIterator
from typing import Final

import httpx2
import openai
from openai import Omit, omit
from openai.types.chat import ChatCompletionChunk
from openai.types.shared_params import ResponseFormatJSONSchema

from mr_review.core.ai.entities import AIStreamEnd, AIStreamItem, GenerationPlan
from mr_review.core.ai.errors import AIProviderRefusalError
from mr_review.core.ai.review_format import REVIEW_COMMENTS_SCHEMA, REVIEW_COMMENTS_SCHEMA_NAME
from mr_review.infra.ai._sdk_errors import SdkErrorTypes, capitalized, to_provider_error

_ERRORS: Final = SdkErrorTypes(
    timeout=openai.APITimeoutError,
    connection=openai.APIConnectionError,
    auth=(openai.AuthenticationError, openai.PermissionDeniedError),
    bad_request=openai.BadRequestError,
    not_found=openai.NotFoundError,
)


def _response_format(plan: GenerationPlan) -> ResponseFormatJSONSchema | Omit:
    if not plan.structured_output:
        return omit
    return {
        "type": "json_schema",
        "json_schema": {"name": REVIEW_COMMENTS_SCHEMA_NAME, "schema": REVIEW_COMMENTS_SCHEMA, "strict": True},
    }


def _chunk_text_and_finish(chunk: ChatCompletionChunk) -> tuple[str, str | None]:
    """The text delta and finish reason of a chunk.

    Chunks without choices are skipped quietly: Azure sends content-filter results that way, and
    servers that report usage send a final chunk with an empty list. Some servers also leave out
    fields the SDK types as required, so every step is read defensively.
    """
    choices = getattr(chunk, "choices", None) or []
    if not choices:
        return "", None
    choice = choices[0]
    content = getattr(getattr(choice, "delta", None), "content", None)
    return content or "", getattr(choice, "finish_reason", None)


class OpenAICompatProvider:
    def __init__(
        self,
        api_key: str,
        *,
        provider_type: str = "openai_compat",
        base_url: str | None = None,
        ssl_verify: bool = True,
        timeout: int = 60,
        transport: httpx2.AsyncBaseTransport | None = None,
    ) -> None:
        self._api_key = api_key
        self._is_openai = provider_type == "openai"
        self._label = "OpenAI" if self._is_openai else "the OpenAI-compatible endpoint"
        self._base_url = base_url or None
        self._ssl_verify = ssl_verify
        self._timeout = timeout
        self._transport = transport

    def _client(self) -> openai.AsyncOpenAI:
        return openai.AsyncOpenAI(
            api_key=self._api_key,
            base_url=self._base_url,
            # httpx2 verifies against the OS trust store (truststore), not certifi's bundle,
            # so corporate/self-signed CAs installed in the system trust store are respected.
            http_client=openai.DefaultAsyncHttpx2Client(
                verify=self._ssl_verify, timeout=float(self._timeout), transport=self._transport
            ),
        )

    async def list_models(self) -> list[str]:
        async with self._client() as client:
            try:
                return sorted([model.id async for model in client.models.list()])
            except openai.APIError as exc:
                raise to_provider_error(exc, _ERRORS, provider=self._label) from exc

    def dispatch(self, prompt: str, plan: GenerationPlan) -> AsyncIterator[AIStreamItem]:
        return self._stream(prompt, plan)

    async def _open_stream(
        self, client: openai.AsyncOpenAI, prompt: str, plan: GenerationPlan
    ) -> openai.AsyncStream[ChatCompletionChunk]:
        limit = plan.max_output_tokens if plan.max_output_tokens is not None else omit
        return await client.chat.completions.create(
            model=plan.model,
            messages=[
                {"role": "system", "content": plan.system_prompt},
                {"role": "user", "content": prompt},
            ],
            stream=True,
            reasoning_effort=plan.effort if plan.effort is not None else omit,
            temperature=plan.temperature if plan.temperature is not None else omit,
            response_format=_response_format(plan),
            max_completion_tokens=limit if self._is_openai else omit,
            max_tokens=omit if self._is_openai else limit,
            extra_body={"reasoning_budget": plan.budget_tokens} if plan.budget_tokens is not None else None,
        )

    async def _stream(self, prompt: str, plan: GenerationPlan) -> AsyncGenerator[AIStreamItem, None]:
        finish_reason: str | None = None
        async with self._client() as client:
            try:
                stream = await self._open_stream(client, prompt, plan)
                async for chunk in stream:
                    text, finished = _chunk_text_and_finish(chunk)
                    finish_reason = finished or finish_reason
                    if text:
                        yield text
            except openai.APIError as exc:
                raise to_provider_error(
                    exc, _ERRORS, provider=self._label, structured_output=plan.structured_output
                ) from exc
        if finish_reason == "content_filter":
            raise AIProviderRefusalError(
                f"{capitalized(self._label)} stopped the answer with its content filter. What arrived before was kept."
            )
        yield AIStreamEnd(truncated=finish_reason == "length")
