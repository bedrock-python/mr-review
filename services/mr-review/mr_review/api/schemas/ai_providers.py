from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from mr_review.core.ai.entities import ReasoningEffort, ReasoningMode, ThinkingSupport
from mr_review.core.ai_providers.entities import AIProviderType


class CreateAIProviderRequest(BaseModel):
    name: str
    type: AIProviderType
    api_key: str
    base_url: str = ""
    models: list[str] = Field(default_factory=list)
    ssl_verify: bool = True
    timeout: int = 60
    max_concurrent: int | None = Field(
        default=None,
        ge=1,
        description="Per-provider in-flight AI dispatch cap; null uses the service-wide default.",
    )


class UpdateAIProviderRequest(BaseModel):
    name: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    models: list[str] | None = None
    ssl_verify: bool | None = None
    timeout: int | None = None
    max_concurrent: int | None = Field(default=None, ge=1)
    clear_max_concurrent: bool = Field(
        default=False,
        description="Reset the per-provider cap so the service-wide default applies again.",
    )


class AIProviderResponse(BaseModel):
    id: UUID
    name: str
    type: AIProviderType
    base_url: str
    models: list[str]
    ssl_verify: bool
    timeout: int
    max_concurrent: int | None
    created_at: datetime


class PreviewModelsRequest(BaseModel):
    """Connection settings to list models with before they are saved.

    With ``provider_id`` the saved provider fills in whatever is left out — a blank ``api_key``
    keeps the saved key. Without it, ``type`` and ``api_key`` are required.
    """

    provider_id: UUID | None = None
    type: AIProviderType | None = None
    api_key: str | None = None
    base_url: str | None = None
    ssl_verify: bool | None = None
    timeout: int | None = Field(default=None, ge=1, le=600)


class ModelCapabilitiesResponse(BaseModel):
    """The request controls a model accepts, so the UI shows only those."""

    provider_type: AIProviderType
    model: str
    known_model: bool = Field(description="false: the id matched no known family; the type's defaults apply.")
    thinking: ThinkingSupport = Field(
        description="always: reasoning cannot be turned off, only tuned; optional: off unless asked for; none."
    )
    reasoning_modes: list[ReasoningMode]
    effort_levels: list[ReasoningEffort]
    default_effort: ReasoningEffort | None
    min_reasoning_budget: int | None
    temperature: bool = Field(description="Temperature is accepted — and only sent while reasoning is off.")
    max_temperature: float
    max_output_tokens: int | None = Field(description="The model's output cap; null when unknown.")
    default_max_output_tokens: int | None = Field(description="Sent when a dispatch names none; null: the endpoint's.")
    structured_output: bool
    structured_output_default: bool
