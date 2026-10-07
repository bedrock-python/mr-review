"""Errors raised while reading an export package. Their messages are safe to show to a user."""

from __future__ import annotations


class PackageSecretsError(ValueError):
    """The secrets of a package cannot be read; nothing has been imported."""


class PassphraseRequiredError(PackageSecretsError):
    def __init__(self) -> None:
        super().__init__("This file is encrypted. Enter the passphrase it was exported with.")


class WrongPassphraseError(PackageSecretsError):
    def __init__(self) -> None:
        super().__init__("Wrong passphrase: it does not decrypt this file.")


class DamagedPackageError(PackageSecretsError):
    """A secret in the package cannot be decrypted although the passphrase is right."""
