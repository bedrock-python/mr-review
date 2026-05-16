from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, SecretStr


class Host(BaseModel):
    id: UUID
    name: str
    type: Literal["gitlab", "github", "gitea", "forgejo", "bitbucket"]
    base_url: str
    token: SecretStr
    color: str | None = None
    favourite_repos: list[str] = Field(default_factory=list)
    timeout: int = 30
    created_at: datetime
