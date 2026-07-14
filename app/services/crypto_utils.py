from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken
import base64

from app.config import settings


def _normalize_key(key: str | bytes) -> bytes:
    if isinstance(key, str):
        key_bytes = key.encode()
    else:
        key_bytes = key
    # If key already is 44-byte urlsafe base64, return as-is
    if len(key_bytes) == 44:
        return key_bytes
    # Otherwise, derive a 32-byte key and base64-encode it
    derived = key_bytes[:32].ljust(32, b"0")
    return base64.urlsafe_b64encode(derived)


def _get_fernet() -> Fernet:
    key = getattr(settings, "AGENT_SECRETS_KEY", None) or getattr(settings, "SECRET_KEY", None)
    if not key:
        raise RuntimeError("No AGENT_SECRETS_KEY or SECRET_KEY configured for encrypting agent secrets.")
    normalized = _normalize_key(key)
    return Fernet(normalized)


def encrypt_value(plaintext: str) -> str:
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_value(token: str) -> str | None:
    try:
        f = _get_fernet()
        return f.decrypt(token.encode()).decode()
    except InvalidToken:
        return None
