from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from mr_review.core.ai_providers.entities import AIProviderType


class CreateAIProviderRequest(BaseModel):
    name: str
    type: AIProviderType
    api_key: str
    base_url: str = ""
    models: list[str] = []
    ssl_verify: bool = True
    timeout: int = 60


class UpdateAIProviderRequest(BaseModel):
    name: str | None = None
    api_key: str | None = None
    base_url: str | None = None
    models: list[str] | None = None
    ssl_verify: bool | None = None
    timeout: int | None = None


class AIProviderResponse(BaseModel):
    id: UUID
    name: str
    type: AIProviderType
    base_url: str
    models: list[str]
    ssl_verify: bool
    timeout: int
    created_at: datetime
