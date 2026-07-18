"""Parse bearer token and resolve Faculty row for teacher JWTs."""

from sqlalchemy.orm import Session

from .. import models
from ..services.auth_tokens import parse_token


def parse_bearer_payload(authorization: str | None) -> dict | None:
    raw = (authorization or "").removeprefix("Bearer").strip()
    if not raw:
        return None
    return parse_token(raw)


def faculty_from_teacher_token(
    payload: dict | None, db: Session
) -> models.Faculty | None:
    if not payload or str(payload.get("role", "")) != "teacher":
        return None
    try:
        fid = int(str(payload.get("sub", "")))
    except ValueError:
        return None
    if fid <= 0:
        return None
    return db.get(models.Faculty, fid)


def is_admin_token(payload: dict | None) -> bool:
    return bool(payload and str(payload.get("role", "")) == "admin")


