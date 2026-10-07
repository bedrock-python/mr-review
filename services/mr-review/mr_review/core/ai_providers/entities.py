from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, SecretStr

AIProviderType = Literal["claude", "openai", "openai_compat"]


class AIProvider(BaseModel):
    # The API key must never reach a log through a validation error message.
    model_config = ConfigDict(hide_input_in_errors=True)

    id: UUID
    name: str
    type: AIProviderType
    api_key: SecretStr
    base_url: str
    models: list[str]
    ssl_verify: bool
    timeout: int
    created_at: datetime
    # When unset, the service-wide default from AIThrottleConfig applies.
    max_concurrent: int | None = None
