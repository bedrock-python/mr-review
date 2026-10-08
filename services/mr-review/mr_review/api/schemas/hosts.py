from __future__ import annotations

from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

_HTTP_SCHEMES = frozenset({"http", "https"})


def validate_http_base_url(value: str) -> str:
    """Return ``value`` without a trailing slash; reject anything but an absolute http(s) URL.

    A base URL without a scheme (``gitlab.example.com``) is stored as given and only fails
    later, on the first call to the host — and the UI cannot show a record it cannot parse.
    """
    stripped = value.strip().rstrip("/")
    parts = urlsplit(stripped)
    if parts.scheme.lower() not in _HTTP_SCHEMES or not parts.netloc:
        raise ValueError("must be an absolute http:// or https:// URL")
    return stripped


class CreateHostRequest(BaseModel):
    name: str
    type: Literal["gitlab", "github", "gitea", "forgejo", "bitbucket"]
    base_url: str
    token: str
    color: str | None = None
    timeout: int = Field(default=30, gt=0)

    @field_validator("base_url")
    @classmethod
    def check_base_url(cls, v: str) -> str:
        return validate_http_base_url(v)


class HostResponse(BaseModel):
    id: UUID
    name: str
    type: Literal["gitlab", "github", "gitea", "forgejo", "bitbucket"]
    base_url: str
    color: str | None = None
    favourite_repos: list[str] = Field(default_factory=list)
    timeout: int = 30
    created_at: datetime


class UpdateHostRequest(BaseModel):
    name: str | None = None
    base_url: str | None = None
    token: str | None = None
    color: str | None = None
    timeout: int | None = Field(default=None, gt=0)

    @field_validator("base_url")
    @classmethod
    def check_base_url(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return validate_http_base_url(v)


class TestConnectionResponse(BaseModel):
    username: str
    name: str
    email: str


class AddRepoByUrlRequest(BaseModel):
    url: str = Field(min_length=1, description="Repo URL or 'owner/repo' path")


class AddRepoByUrlResponse(BaseModel):
    host: HostResponse
    repo_path: str
