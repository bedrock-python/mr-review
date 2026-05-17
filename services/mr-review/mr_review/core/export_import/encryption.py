"""Token encryption/decryption utilities for export/import."""

from __future__ import annotations

import base64
import os

from cryptography.fernet import Fernet
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


def _derive_key(password: str, salt: bytes) -> bytes:
    """Derive encryption key from password using PBKDF2.

    Args:
        password: User-provided password
        salt: Random salt bytes

    Returns:
        Base64-encoded 32-byte key suitable for Fernet
    """
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=600_000,
        backend=default_backend(),
    )
    key = kdf.derive(password.encode())
    return base64.urlsafe_b64encode(key)


def encrypt_token(token: str, password: str) -> str:
    """Encrypt a token with a password.

    Args:
        token: Plain text token to encrypt
        password: Password for encryption

    Returns:
        Encrypted token in format "base64_salt:encrypted_data"
    """
    # Generate random salt
    salt = os.urandom(16)

    # Derive key from password and salt
    key = _derive_key(password, salt)

    # Encrypt token
    fernet = Fernet(key)
    encrypted = fernet.encrypt(token.encode())

    # Combine salt and encrypted data
    salt_b64 = base64.urlsafe_b64encode(salt).decode()
    combined = f"{salt_b64}:{encrypted.decode()}"

    return combined


def decrypt_token(encrypted_token: str, password: str) -> str:
    """Decrypt an encrypted token with a password.

    Args:
        encrypted_token: Encrypted token in format "base64_salt:encrypted_data"
        password: Password for decryption

    Returns:
        Decrypted plain text token

    Raises:
        ValueError: If password is incorrect or token format is invalid
    """
    # Split salt and encrypted data
    try:
        salt_b64, encrypted_data = encrypted_token.split(":", 1)
    except ValueError as e:
        msg = "Invalid encrypted token format"
        raise ValueError(msg) from e

    # Decode salt
    salt = base64.urlsafe_b64decode(salt_b64)

    # Derive key from password and salt
    key = _derive_key(password, salt)

    # Decrypt token
    fernet = Fernet(key)
    try:
        decrypted = fernet.decrypt(encrypted_data.encode())
    except Exception as e:
        msg = "Failed to decrypt token - incorrect password or corrupted data"
        raise ValueError(msg) from e

    return decrypted.decode()
