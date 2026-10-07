"""Import data use case."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Literal, TypeVar
from uuid import UUID

from pydantic import SecretStr

from mr_review.core.ai_providers.entities import AIProvider
from mr_review.core.ai_providers.repositories import AIProviderRepository
from mr_review.core.export_import.encryption import PackageCipher, decrypt_token
from mr_review.core.export_import.entities import (
    ExportData,
    ImportOutcome,
    ImportRequest,
    ImportResult,
    MergeStrategy,
    PackagedAIProvider,
    PackagedHost,
)
from mr_review.core.export_import.errors import (
    DamagedPackageError,
    PassphraseRequiredError,
    WrongPassphraseError,
)
from mr_review.core.hosts.entities import Host
from mr_review.core.hosts.repositories import HostRepository
from mr_review.core.reviews.entities import Review
from mr_review.core.reviews.repositories import ReviewRepository

_log = logging.getLogger(__name__)

_E = TypeVar("_E")
_Revealer = Callable[[SecretStr | None, str], str | None]
_RecordKind = Literal["hosts", "ai_providers", "reviews"]
_RESULT_FIELD: dict[ImportOutcome, str] = {"created": "imported", "updated": "updated", "skipped": "skipped"}


class ImportDataUseCase:
    """Import a package (hosts, AI providers, reviews) into the store.

    Nothing is written until the whole package has been validated and every secret in it
    decrypted, so a wrong passphrase or a damaged file changes nothing.

    Records are matched by id, and the id, creation time and every other field travel with
    the record, so reviews keep pointing at their hosts. For a record that already exists:

    * ``skip`` leaves the local record untouched;
    * ``merge`` takes the file's values but keeps what exists only locally: host favourites
      and provider models are unioned, a secret the file does not carry is kept, and of two
      versions of a review the more recently updated one wins;
    * ``replace`` overwrites the local record with the file's version, keeping only its
      creation time and any secret the file does not carry.

    Records only in the file are added under every strategy; records only stored here are
    never removed. An existing record that would come out unchanged counts as skipped.
    """

    def __init__(
        self,
        host_repo: HostRepository,
        ai_provider_repo: AIProviderRepository,
        review_repo: ReviewRepository,
    ) -> None:
        self._host_repo = host_repo
        self._ai_provider_repo = ai_provider_repo
        self._review_repo = review_repo

    async def execute(self, request: ImportRequest) -> ImportResult:
        """Import ``request.data``.

        Raises:
            PackageSecretsError: The file is encrypted and the passphrase is missing or
                wrong, or a secret in it is damaged. Nothing has been written.
        """
        # Key derivation is deliberately slow; keep it off the event loop.
        hosts, providers = await asyncio.to_thread(_reveal_secrets, request.data, request.decryption_password)
        strategy = request.merge_strategy
        result = ImportResult()
        for host, token in hosts:
            await self._import_host(host, token, strategy, result)
        for provider, api_key in providers:
            await self._import_ai_provider(provider, api_key, strategy, result)
        for review in request.data.reviews:
            await self._import_review(review, strategy, result)
        return result

    async def _import_host(
        self, record: PackagedHost, token: str | None, strategy: MergeStrategy, result: ImportResult
    ) -> None:
        def decide(current: Host | None) -> tuple[Host | None, ImportOutcome]:
            return _merge_host(current, record, token, strategy)

        outcome = await _import_record(self._host_repo.upsert_with, record.id, decide, f"Host '{record.name}'", result)
        if outcome is None:
            return
        _count(result, "hosts", outcome)
        if outcome == "created" and token is None:
            result.warnings.append(f"Host '{record.name}' was imported without a token; add one in Settings.")

    async def _import_ai_provider(
        self, record: PackagedAIProvider, api_key: str | None, strategy: MergeStrategy, result: ImportResult
    ) -> None:
        def decide(current: AIProvider | None) -> tuple[AIProvider | None, ImportOutcome]:
            return _merge_ai_provider(current, record, api_key, strategy)

        outcome = await _import_record(
            self._ai_provider_repo.upsert_with, record.id, decide, f"AI provider '{record.name}'", result
        )
        if outcome is None:
            return
        _count(result, "ai_providers", outcome)
        if outcome == "created" and api_key is None:
            result.warnings.append(f"AI provider '{record.name}' was imported without an API key; add one in Settings.")

    async def _import_review(self, review: Review, strategy: MergeStrategy, result: ImportResult) -> None:
        def decide(current: Review | None) -> tuple[Review | None, ImportOutcome]:
            return _merge_review(current, review, strategy)

        outcome = await _import_record(self._review_repo.upsert_with, review.id, decide, f"Review {review.id}", result)
        if outcome is not None:
            _count(result, "reviews", outcome)


async def _import_record(
    upsert_with: Callable[[UUID, Callable[[_E | None], _E | None]], Awaitable[_E | None]],
    record_id: UUID,
    decide: Callable[[_E | None], tuple[_E | None, ImportOutcome]],
    label: str,
    result: ImportResult,
) -> ImportOutcome | None:
    """Apply ``decide`` to the stored record atomically; ``None`` if writing it failed."""
    outcome: ImportOutcome = "skipped"

    def _change(current: _E | None) -> _E | None:
        nonlocal outcome
        new, outcome = decide(current)
        return new

    try:
        await upsert_with(record_id, _change)
    except Exception as exc:
        # The package was validated up front; what is left is the store failing on one
        # record, which must not abort the others.
        _log.exception("Import of %s failed", label)
        result.errors.append(f"{label}: {exc}")
        return None
    return outcome


def _count(result: ImportResult, kind: _RecordKind, outcome: ImportOutcome) -> None:
    name = f"{kind}_{_RESULT_FIELD[outcome]}"
    setattr(result, name, getattr(result, name) + 1)


def _reveal_secrets(
    data: ExportData, password: SecretStr | None
) -> tuple[list[tuple[PackagedHost, str | None]], list[tuple[PackagedAIProvider, str | None]]]:
    """Every record with its secret in plain text (``None`` when the file carries none)."""
    reveal = _secret_revealer(data, password)
    hosts = [(host, reveal(host.token, f"host '{host.name}'")) for host in data.hosts]
    providers = [(p, reveal(p.api_key, f"AI provider '{p.name}'")) for p in data.ai_providers]
    return hosts, providers


def _secret_revealer(data: ExportData, password: SecretStr | None) -> _Revealer:
    if not data.encrypted:
        return _reveal_plain
    if password is None:
        raise PassphraseRequiredError
    if data.encryption is None:
        return _legacy_revealer(password.get_secret_value())
    # Derives the key once and checks the passphrase before any secret is touched.
    return _package_revealer(PackageCipher.open(password.get_secret_value(), data.encryption))


def _reveal_plain(secret: SecretStr | None, _label: str) -> str | None:
    return secret.get_secret_value() if secret is not None else None


def _package_revealer(cipher: PackageCipher) -> _Revealer:
    def reveal(secret: SecretStr | None, label: str) -> str | None:
        if secret is None:
            return None
        try:
            return cipher.decrypt(secret.get_secret_value())
        except ValueError as exc:
            raise DamagedPackageError(f"The secret of {label} cannot be decrypted; the file is damaged.") from exc

    return reveal


def _legacy_revealer(passphrase: str) -> _Revealer:
    """Version 1 files encrypt every secret under its own salt, with no way to check the
    passphrase first: the first secret that fails to decrypt means it is wrong."""

    def reveal(secret: SecretStr | None, _label: str) -> str | None:
        if secret is None:
            return None
        try:
            return decrypt_token(secret.get_secret_value(), passphrase)
        except ValueError as exc:
            raise WrongPassphraseError from exc

    return reveal


def _union(first: list[str], second: list[str]) -> list[str]:
    """``first`` followed by the items of ``second`` it lacks, without duplicates."""
    merged = list(dict.fromkeys(first))
    seen = set(merged)
    merged.extend(item for item in dict.fromkeys(second) if item not in seen)
    return merged


def _merge_host(
    current: Host | None, record: PackagedHost, token: str | None, strategy: MergeStrategy
) -> tuple[Host | None, ImportOutcome]:
    if current is None:
        return _host_from_record(record, token if token is not None else ""), "created"
    if strategy == "skip":
        return None, "skipped"
    incoming = _host_from_record(record, token if token is not None else current.token.get_secret_value())
    updates: dict[str, object] = {"created_at": current.created_at}
    if strategy == "merge":
        updates["favourite_repos"] = _union(current.favourite_repos, incoming.favourite_repos)
    merged = incoming.model_copy(update=updates)
    return (None, "skipped") if merged == current else (merged, "updated")


def _merge_ai_provider(
    current: AIProvider | None, record: PackagedAIProvider, api_key: str | None, strategy: MergeStrategy
) -> tuple[AIProvider | None, ImportOutcome]:
    if current is None:
        return _ai_provider_from_record(record, api_key if api_key is not None else ""), "created"
    if strategy == "skip":
        return None, "skipped"
    incoming = _ai_provider_from_record(record, api_key if api_key is not None else current.api_key.get_secret_value())
    updates: dict[str, object] = {"created_at": current.created_at}
    if strategy == "merge":
        # The file's order first: its first model is the provider's default.
        updates["models"] = _union(incoming.models, current.models)
    merged = incoming.model_copy(update=updates)
    return (None, "skipped") if merged == current else (merged, "updated")


def _merge_review(
    current: Review | None, incoming: Review, strategy: MergeStrategy
) -> tuple[Review | None, ImportOutcome]:
    if current is None:
        return incoming, "created"
    if strategy == "skip" or (strategy == "merge" and incoming.updated_at <= current.updated_at):
        return None, "skipped"
    merged = incoming.model_copy(update={"created_at": current.created_at})
    return (None, "skipped") if merged == current else (merged, "updated")


def _host_from_record(record: PackagedHost, token: str) -> Host:
    return Host.model_validate({**record.model_dump(exclude={"token"}), "token": token})


def _ai_provider_from_record(record: PackagedAIProvider, api_key: str) -> AIProvider:
    return AIProvider.model_validate({**record.model_dump(exclude={"api_key"}), "api_key": api_key})
