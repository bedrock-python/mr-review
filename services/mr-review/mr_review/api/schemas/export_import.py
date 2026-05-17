"""Export/Import API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ExportRequestSchema(BaseModel):
    """Request to export data."""

    include_hosts: bool = True
    include_ai_providers: bool = True
    include_reviews: bool = True


class ExportResponseSchema(BaseModel):
    """Export data response - returns JSON data."""

    version: str
    exported_at: datetime
    hosts: list[dict[str, Any]] = Field(default_factory=list)
    ai_providers: list[dict[str, Any]] = Field(default_factory=list)
    reviews: list[dict[str, Any]] = Field(default_factory=list)


class ImportRequestSchema(BaseModel):
    """Request to import data."""

    version: str
    exported_at: datetime
    hosts: list[dict[str, Any]] = Field(default_factory=list)
    ai_providers: list[dict[str, Any]] = Field(default_factory=list)
    reviews: list[dict[str, Any]] = Field(default_factory=list)
    merge_strategy: str = "skip"  # "skip", "replace", or "merge"


class ImportResponseSchema(BaseModel):
    """Result of import operation."""

    hosts_imported: int
    hosts_skipped: int
    ai_providers_imported: int
    ai_providers_skipped: int
    reviews_imported: int
    reviews_skipped: int
    errors: list[str] = Field(default_factory=list)
