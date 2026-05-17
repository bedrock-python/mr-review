"""Export/Import entities."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from mr_review.core.ai_providers.entities import AIProvider
from mr_review.core.hosts.entities import Host
from mr_review.core.reviews.entities import Review


class ExportRequest(BaseModel):
    """Request to export data."""

    include_hosts: bool = True
    include_ai_providers: bool = True
    include_reviews: bool = True
    encryption_password: str | None = None  # If provided, tokens will be encrypted


class ExportData(BaseModel):
    """Complete export data package."""

    version: str = "1.0"
    exported_at: datetime
    encrypted: bool = False  # True if tokens are encrypted
    hosts: list[Host] = Field(default_factory=list)
    ai_providers: list[AIProvider] = Field(default_factory=list)
    reviews: list[Review] = Field(default_factory=list)


class ImportRequest(BaseModel):
    """Request to import data."""

    data: ExportData
    merge_strategy: str = "skip"  # "skip", "replace", or "merge"
    decryption_password: str | None = None  # Required if data is encrypted


class ImportResult(BaseModel):
    """Result of import operation."""

    hosts_imported: int = 0
    hosts_skipped: int = 0
    ai_providers_imported: int = 0
    ai_providers_skipped: int = 0
    reviews_imported: int = 0
    reviews_skipped: int = 0
    errors: list[str] = Field(default_factory=list)
