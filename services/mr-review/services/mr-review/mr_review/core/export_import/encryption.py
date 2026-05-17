"""Token encryption/decryption utilities."""

from __future__ import annotations

import base64

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.fernet import Fernet


def _derive_key(password: str, salt: bytes) -> bytes:
    """Derive encryption key from password using PBKDF2."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=600_000,  # OWASP recommendation for PBKDF2-SHA256
    )
    return base64.urlsafe_b64encode(kdf.derive(password.encode()))


def encrypt_token(token: str, password: str) -> str:
    """Encrypt a token with a password.

    Args:
        token: Token to encrypt
        password: Password for encryption

    Returns:
        Base64-encoded encrypted token with salt (format: salt:encrypted_data)
    """
    # Generate random salt
    import os

    salt = os.urandom(16)

    # Derive key from password
    key = _derive_key(password, salt)

    # Encrypt token
    fernet = Fernet(key)
    encrypted = fernet.encrypt(token.encode())

    # Combine salt and encrypted data
    combined = base64.urlsafe_b64encode(salt).decode() + ":" + encrypted.decode()
    return combined


def decrypt_token(encrypted_token: str, password: str) -> str:
    """Decrypt a token with a password.

    Args:
        encrypted_token: Encrypted token (format: salt:encrypted_data)
        password: Password for decryption

    Returns:
        Decrypted token

    Raises:
        ValueError: If decryption fails (wrong password or corrupted data)
    """
    try:
        # Split salt and encrypted data
        salt_b64, encrypted_data = encrypted_token.split(":", 1)
        salt = base64.urlsafe_b64decode(salt_b64)

        # Derive key from password
        key = _derive_key(password, salt)

        # Decrypt token
        fernet = Fernet(key)
        decrypted = fernet.decrypt(encrypted_data.encode())
        return decrypted.decode()
    except Exception as e:
        msg = "Failed to decrypt token. Wrong password or corrupted data."
        raise ValueError(msg) from e
