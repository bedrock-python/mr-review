from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class Host(BaseModel):
    id: UUID
    name: str
    type: Literal["gitlab", "github", "gitea", "forgejo", "bitbucket"]
    base_url: str
    token: str
    created_at: datetime
