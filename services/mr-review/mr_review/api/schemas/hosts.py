from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, field_validator


class CreateHostRequest(BaseModel):
    name: str
    type: Literal["gitlab", "github", "gitea", "forgejo", "bitbucket"]
    base_url: str
    token: str

    @field_validator("base_url")
    @classmethod
    def strip_trailing_slash(cls, v: str) -> str:
        return v.rstrip("/")


class HostResponse(BaseModel):
    id: UUID
    name: str
    type: Literal["gitlab", "github", "gitea", "forgejo", "bitbucket"]
    base_url: str
    created_at: datetime


class UpdateHostRequest(BaseModel):
    name: str | None = None
    base_url: str | None = None
    token: str | None = None

    @field_validator("base_url")
    @classmethod
    def strip_trailing_slash(cls, v: str | None) -> str | None:
        if v is not None:
            return v.rstrip("/")
        return v


class TestConnectionResponse(BaseModel):
    username: str
    name: str
    email: str
