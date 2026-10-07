"""Export/Import entities: the export file format and the requests that produce and consume it.

An export file ("package") carries hosts, AI providers and reviews as JSON. Host tokens and
provider API keys travel in one of three ways, recorded in ``secrets``:

* ``encrypted`` — each secret is a Fernet token under one key derived from a passphrase;
  the derivation parameters are in ``encryption``;
* ``plain`` — secrets in clear text, only when the user explicitly opted in;
* ``omitted`` — no secrets at all.

Version 1 files have neither ``secrets`` nor ``encryption``: secrets are plain, or each one
is encrypted on its own as ``"<salt>:<fernet token>"`` when ``encrypted`` is true. They
are still accepted for import.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator, model_validator

from mr_review.core.ai_providers.entities import AIProviderType
from mr_review.core.hosts.entities import HostType
from mr_review.core.reviews.entities import Review

PACKAGE_VERSION = "2.0"
_SUPPORTED_MAJOR_VERSIONS = frozenset({"1", "2"})

# Bounds for the key-derivation cost read from a file: low enough that a crafted file
# cannot pin a CPU for minutes, high enough that a weak setting is refused.
MIN_KDF_ITERATIONS = 100_000
MAX_KDF_ITERATIONS = 5_000_000

SecretsMode = Literal["encrypted", "plain", "omitted"]
MergeStrategy = Literal["skip", "merge", "replace"]
ImportOutcome = Literal["created", "updated", "skipped"]


class EncryptionParams(BaseModel):
    """How the secrets of an encrypted package were encrypted: one key for the whole file."""

    kdf: Literal["pbkdf2-sha256"] = "pbkdf2-sha256"
    iterations: int = Field(ge=MIN_KDF_ITERATIONS, le=MAX_KDF_ITERATIONS)
    salt: str = Field(min_length=1, description="URL-safe base64 of the KDF salt")
    check: str = Field(
        min_length=1,
        description="A known marker encrypted with the key; tells a wrong passphrase from a damaged file",
    )


class PackagedHost(BaseModel):
    """A host as it travels in a package: the token is plain, encrypted, or absent.

    Mirrors :class:`~mr_review.core.hosts.entities.Host` field for field (a test keeps the
    two in step), except that the token is optional.
    """

    model_config = ConfigDict(hide_input_in_errors=True)

    id: UUID
    name: str
    type: HostType
    base_url: str
    token: SecretStr | None = None
    color: str | None = None
    favourite_repos: list[str] = Field(default_factory=list)
    timeout: int = 30
    created_at: datetime


class PackagedAIProvider(BaseModel):
    """An AI provider as it travels in a package: the API key is plain, encrypted, or absent.

    Mirrors :class:`~mr_review.core.ai_providers.entities.AIProvider` field for field (a test
    keeps the two in step), except that the API key is optional.
    """

    model_config = ConfigDict(hide_input_in_errors=True)

    id: UUID
    name: str
    type: AIProviderType
    api_key: SecretStr | None = None
    base_url: str = ""
    models: list[str] = Field(default_factory=list)
    ssl_verify: bool = True
    timeout: int = 60
    created_at: datetime
    max_concurrent: int | None = None


class ExportData(BaseModel):
    """The content of an export file."""

    model_config = ConfigDict(hide_input_in_errors=True)

    version: str = PACKAGE_VERSION
    exported_at: datetime
    encrypted: bool = False
    secrets: SecretsMode | None = None
    encryption: EncryptionParams | None = None
    hosts: list[PackagedHost] = Field(default_factory=list)
    ai_providers: list[PackagedAIProvider] = Field(default_factory=list)
    reviews: list[Review] = Field(default_factory=list)

    @field_validator("version")
    @classmethod
    def _supported_version(cls, value: str) -> str:
        if value.split(".", 1)[0] not in _SUPPORTED_MAJOR_VERSIONS:
            raise ValueError(f"Unsupported export format version {value!r}")
        return value

    @model_validator(mode="after")
    def _consistent_secrets(self) -> ExportData:
        if self.secrets is not None and self.encrypted != (self.secrets == "encrypted"):
            raise ValueError("'encrypted' contradicts 'secrets'")
        if self.encryption is not None and not self.encrypted:
            raise ValueError("'encryption' is set but the file is not marked as encrypted")
        return self

    @property
    def secrets_mode(self) -> SecretsMode:
        """How the file carries secrets, inferred for version 1 files that do not say."""
        if self.secrets is not None:
            return self.secrets
        if self.encrypted:
            return "encrypted"
        has_secret = any(h.token for h in self.hosts) or any(p.api_key for p in self.ai_providers)
        return "plain" if has_secret else "omitted"


class ExportRequest(BaseModel):
    """What to export, and how to carry secrets: encrypted, in plain text, or not at all."""

    model_config = ConfigDict(hide_input_in_errors=True)

    include_hosts: bool = True
    include_ai_providers: bool = True
    include_reviews: bool = True
    encryption_password: SecretStr | None = None
    include_plain_secrets: bool = False

    @property
    def secrets_mode(self) -> SecretsMode:
        if self.encryption_password is not None:
            return "encrypted"
        return "plain" if self.include_plain_secrets else "omitted"


class ImportRequest(BaseModel):
    """Import a package with a merge strategy (see ``ImportDataUseCase`` for the semantics)."""

    model_config = ConfigDict(hide_input_in_errors=True)

    data: ExportData
    merge_strategy: MergeStrategy = "skip"
    decryption_password: SecretStr | None = None


class ImportResult(BaseModel):
    """What an import did. ``imported`` are new records, ``updated`` existing records that
    changed, ``skipped`` existing records left as they were."""

    hosts_imported: int = 0
    hosts_updated: int = 0
    hosts_skipped: int = 0
    ai_providers_imported: int = 0
    ai_providers_updated: int = 0
    ai_providers_skipped: int = 0
    reviews_imported: int = 0
    reviews_updated: int = 0
    reviews_skipped: int = 0
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ImportPreviewCounts(BaseModel):
    """Records of one kind in a package; ``existing`` already exist here under the same id."""

    total: int = 0
    existing: int = 0


class ImportPreview(BaseModel):
    """What a package contains and how it overlaps with the data already stored."""

    version: str
    exported_at: datetime
    encrypted: bool
    secrets: SecretsMode
    hosts: ImportPreviewCounts
    ai_providers: ImportPreviewCounts
    reviews: ImportPreviewCounts
    reviews_without_host: int = Field(
        description="Reviews whose host is neither stored here nor part of the package",
    )
