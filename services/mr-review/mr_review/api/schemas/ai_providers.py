from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

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
