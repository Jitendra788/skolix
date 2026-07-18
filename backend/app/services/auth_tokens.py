import base64
import hashlib
import hmac
import json
import os
import time

TOKEN_TTL_SECONDS = 60 * 60 * 12  # 12 hours


def _secret_key() -> str:
    return os.getenv("SKOLIX_AUTH_SECRET", "skolix-dev-secret-change-me")


def _sign(payload_b64: str) -> str:
    sig = hmac.new(
        _secret_key().encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(sig).decode("utf-8").rstrip("=")


def create_token(role: str, subject: str, display_name: str) -> str:
    now = int(time.time())
    payload = {
        "role": role,
        "sub": subject,
        "name": display_name,
        "iat": now,
        "exp": now + TOKEN_TTL_SECONDS,
    }
    payload_raw = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    payload_b64 = base64.urlsafe_b64encode(payload_raw).decode("utf-8").rstrip("=")
    sig = _sign(payload_b64)
    return f"{payload_b64}.{sig}"


def parse_token(token: str) -> dict | None:
    if "." not in token:
        return None
    payload_b64, sig = token.split(".", 1)
    expected = _sign(payload_b64)
    if not hmac.compare_digest(sig, expected):
        return None
    pad = "=" * (-len(payload_b64) % 4)
    try:
        data = base64.urlsafe_b64decode((payload_b64 + pad).encode("utf-8"))
        payload = json.loads(data.decode("utf-8"))
    except Exception:
        return None
    exp = int(payload.get("exp", 0) or 0)
    if exp <= int(time.time()):
        return None
    return payload if isinstance(payload, dict) else None
