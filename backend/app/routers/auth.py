import os

import bcrypt
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..routers.faculty import effective_teacher_username
from ..routers.students import _effective_login_username
from ..services.auth_tokens import create_token, parse_token

router = APIRouter(prefix="/auth", tags=["auth"])


def _admin_username() -> str:
    return (os.getenv("SKOLIX_ADMIN_USER", "admin") or "admin").strip()


def _admin_password() -> str:
    return os.getenv("SKOLIX_ADMIN_PASS", "admin123") or "admin123"


@router.post("/login", response_model=schemas.AuthLoginResponse)
def auth_login(body: schemas.AuthLoginRequest, db: Session = Depends(get_db)):
    role = body.role
    login_id = body.login_id.strip()
    password = body.password
    if not login_id or not password:
        raise HTTPException(status_code=400, detail="login_id and password are required")

    if role == "admin":
        if login_id != _admin_username() or password != _admin_password():
            raise HTTPException(status_code=401, detail="Invalid admin credentials")
        token = create_token("admin", login_id, "Administrator")
        return schemas.AuthLoginResponse(
            token=token,
            role="admin",
            user_id=login_id,
            display_name="Administrator",
            class_assigned="",
        )

    if role == "teacher":
        rows = db.query(models.Faculty).filter(models.Faculty.login_enabled.is_(True)).all()
        for row in rows:
            eff = effective_teacher_username(row).lower()
            if eff != login_id.lower():
                continue
            pwh = (row.login_password_hash or "").strip()
            if not pwh:
                continue
            if bcrypt.checkpw(password.encode("utf-8"), pwh.encode("utf-8")):
                token = create_token("teacher", str(row.id), (row.name or "").strip() or "Teacher")
                return schemas.AuthLoginResponse(
                    token=token,
                    role="teacher",
                    user_id=str(row.id),
                    display_name=(row.name or "").strip() or "Teacher",
                    class_assigned=(row.class_assigned or "").strip(),
                )
        raise HTTPException(status_code=401, detail="Invalid teacher credentials")

    rows = db.query(models.Student).filter(models.Student.login_enabled.is_(True)).all()
    for row in rows:
        eff = _effective_login_username(row).lower()
        if eff != login_id.lower():
            continue
        pwh = (row.login_password_hash or "").strip()
        if not pwh:
            continue
        if bcrypt.checkpw(password.encode("utf-8"), pwh.encode("utf-8")):
            display = (row.full_name or "").strip() or "Student"
            token = create_token("student", str(row.id), display)
            return schemas.AuthLoginResponse(
                token=token,
                role="student",
                user_id=str(row.id),
                display_name=display,
                class_assigned="",
            )
    raise HTTPException(status_code=401, detail="Invalid student credentials")


@router.get("/me", response_model=schemas.AuthMeResponse)
def auth_me(
    authorization: str | None = Header(default=None), db: Session = Depends(get_db)
):
    token = (authorization or "").removeprefix("Bearer").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    payload = parse_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    role = str(payload.get("role", ""))
    class_assigned = ""
    if role == "teacher":
        try:
            fid = int(str(payload.get("sub", "")))
            fac = db.get(models.Faculty, fid)
            if fac:
                class_assigned = (fac.class_assigned or "").strip()
        except ValueError:
            pass
    return schemas.AuthMeResponse(
        role=role,
        user_id=str(payload.get("sub", "")),
        display_name=str(payload.get("name", "")),
        class_assigned=class_assigned,
    )
