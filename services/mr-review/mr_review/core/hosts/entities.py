from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, SecretStr

HostType = Literal["gitlab", "github", "gitea", "forgejo", "bitbucket"]


class Host(BaseModel):
    # The token must never reach a log through a validation error message.
    model_config = ConfigDict(hide_input_in_errors=True)

    id: UUID
    name: str
    type: HostType
    base_url: str
    token: SecretStr
    color: str | None = None
    favourite_repos: list[str] = Field(default_factory=list)
    timeout: int = 30
    created_at: datetime
