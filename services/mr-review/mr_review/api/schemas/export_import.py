"""Export/Import API schemas.

The export file is :class:`~mr_review.core.export_import.entities.ExportData` as JSON. An
import request is that same file with the merge strategy and the passphrase added, so a
client can send the file it read back with two extra keys.
"""

from __future__ import annotations

from pydantic import ConfigDict, Field, SecretStr, model_validator

from mr_review.core.export_import.entities import (
    ExportData,
    ImportPreview,
    ImportResult,
    MergeStrategy,
)
from mr_review.core.export_import.entities import ExportRequest as _ExportRequest


class ExportRequestSchema(_ExportRequest):
    """What to export. Secrets are encrypted with ``encryption_password``, included in
    plain text only with ``include_plain_secrets``, and left out otherwise."""

    model_config = ConfigDict(hide_input_in_errors=True)

    encryption_password: SecretStr | None = Field(default=None, min_length=1)

    @model_validator(mode="after")
    def _one_way_to_carry_secrets(self) -> ExportRequestSchema:
        if self.encryption_password is not None and self.include_plain_secrets:
            raise ValueError("Choose either encryption_password or include_plain_secrets, not both")
        return self


class ImportRequestSchema(ExportData):
    """An export file plus how to merge it and, for an encrypted file, its passphrase."""

    model_config = ConfigDict(hide_input_in_errors=True)

    merge_strategy: MergeStrategy = "skip"
    decryption_password: SecretStr | None = None

    def package(self) -> ExportData:
        """The export file part of the request, already validated."""
        return ExportData.model_construct(
            _fields_set=self.model_fields_set & set(ExportData.model_fields),
            **{name: getattr(self, name) for name in ExportData.model_fields},
        )


class ImportResponseSchema(ImportResult):
    """Result of an import: per kind, new records (``imported``), existing records that
    changed (``updated``) and existing records left as they were (``skipped``)."""


class ImportPreviewResponseSchema(ImportPreview):
    """What an export file contains and how many of its records already exist here."""
