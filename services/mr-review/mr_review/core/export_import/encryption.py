"""Secret encryption for export packages.

Current format: one key per package, derived once with PBKDF2-SHA256 from the passphrase
and a random salt; every secret is a Fernet token under that key. The salt, the iteration
count and an encrypted check marker go into the package's ``encryption`` block.

Legacy format (version 1 files): every secret carries its own salt as
``"<urlsafe-b64 salt>:<fernet token>"`` and needs its own key derivation. Only decryption
is kept for it, so old files can still be imported.

Key derivation costs tens of milliseconds by design; callers on an event loop run these
functions in a worker thread.
"""

from __future__ import annotations

import base64
import binascii
import os

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from mr_review.core.export_import.entities import EncryptionParams
from mr_review.core.export_import.errors import DamagedPackageError, WrongPassphraseError

KDF_ITERATIONS = 600_000
_SALT_BYTES = 16
_CHECK_MARKER = b"mr-review export"


def _derive_key(password: str, salt: bytes, iterations: int = KDF_ITERATIONS) -> bytes:
    """Derive a Fernet key (URL-safe base64 of 32 bytes) from a password with PBKDF2-SHA256."""
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations)
    return base64.urlsafe_b64encode(kdf.derive(password.encode()))


class PackageCipher:
    """Encrypts and decrypts the secrets of one package with a single derived key."""

    def __init__(self, fernet: Fernet) -> None:
        self._fernet = fernet

    @classmethod
    def create(cls, password: str, iterations: int = KDF_ITERATIONS) -> tuple[PackageCipher, EncryptionParams]:
        """Derive a fresh key for a new package; return it with the parameters to store."""
        salt = os.urandom(_SALT_BYTES)
        cipher = cls(Fernet(_derive_key(password, salt, iterations)))
        params = EncryptionParams(
            iterations=iterations,
            salt=base64.urlsafe_b64encode(salt).decode(),
            check=cipher._fernet.encrypt(_CHECK_MARKER).decode(),
        )
        return cipher, params

    @classmethod
    def open(cls, password: str, params: EncryptionParams) -> PackageCipher:
        """Re-derive a package's key, raising :class:`WrongPassphraseError` if it does not fit."""
        try:
            salt = base64.urlsafe_b64decode(params.salt)
        except (binascii.Error, ValueError) as exc:
            raise DamagedPackageError("The file's encryption block is damaged.") from exc
        cipher = cls(Fernet(_derive_key(password, salt, params.iterations)))
        try:
            marker = cipher._fernet.decrypt(params.check.encode())
        except InvalidToken as exc:
            raise WrongPassphraseError from exc
        if marker != _CHECK_MARKER:
            raise WrongPassphraseError
        return cipher

    def encrypt(self, secret: str) -> str:
        return self._fernet.encrypt(secret.encode()).decode()

    def decrypt(self, token: str) -> str:
        """Decrypt one secret; ``ValueError`` if it was not encrypted with this key."""
        try:
            return self._fernet.decrypt(token.encode()).decode()
        except InvalidToken as exc:
            raise ValueError("Secret cannot be decrypted with this file's key") from exc


def encrypt_token(token: str, password: str) -> str:
    """Encrypt one secret in the legacy per-secret format ``"<salt>:<fernet token>"``.

    Kept for tests and tooling that need version 1 files; new exports use :class:`PackageCipher`.
    """
    salt = os.urandom(_SALT_BYTES)
    encrypted = Fernet(_derive_key(password, salt)).encrypt(token.encode())
    return f"{base64.urlsafe_b64encode(salt).decode()}:{encrypted.decode()}"


def decrypt_token(encrypted_token: str, password: str) -> str:
    """Decrypt one secret in the legacy per-secret format ``"<salt>:<fernet token>"``.

    Raises:
        ValueError: If the password is wrong or the value is not in that format.
    """
    try:
        salt_b64, encrypted_data = encrypted_token.split(":", 1)
        salt = base64.urlsafe_b64decode(salt_b64)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid encrypted token format") from exc
    try:
        return Fernet(_derive_key(password, salt)).decrypt(encrypted_data.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Failed to decrypt token - incorrect password or corrupted data") from exc
