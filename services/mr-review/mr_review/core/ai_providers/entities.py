from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, SecretStr

AIProviderType = Literal["claude", "openai", "openai_compat"]


class AIProvider(BaseModel):
    id: UUID
    name: str
    type: AIProviderType
    api_key: SecretStr
    base_url: str
    models: list[str]
    ssl_verify: bool
    timeout: int
    created_at: datetime
