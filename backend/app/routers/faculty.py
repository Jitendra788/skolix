import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/faculty", tags=["faculty"])


def _hash_portal_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def default_teacher_password_plain(row: models.Faculty) -> str:
    name = (row.name or "").strip().replace(" ", "")
    dob = (row.date_of_birth or "").strip()
    phone = (row.phone or "").strip()
    base = f"{name}{dob}"
    if len(base) < 6:
        base = f"{name}{phone}"
    if len(base) < 6:
        base = "teacher-portal"
    return base


def effective_teacher_username(row: models.Faculty) -> str:
    custom = (row.login_username or "").strip()
    if custom:
        return custom
    email = (row.email or "").strip()
    if email:
        return email
    phone = (row.phone or "").strip()
    if phone:
        return phone
    return f"teacher-{row.id}"


def sync_faculty_missing_portal_passwords(db: Session) -> int:
    rows = db.query(models.Faculty).all()
    updated = 0
    for row in rows:
        if (row.login_password_hash or "").strip():
            continue
        row.login_enabled = True
        row.login_password_hash = _hash_portal_password(default_teacher_password_plain(row))
        if not (row.login_username or "").strip():
            row.login_username = effective_teacher_username(row)
        updated += 1
    if updated:
        db.commit()
    return updated


def _faculty_read(row: models.Faculty) -> schemas.FacultyRead:
    return schemas.FacultyRead(
        id=row.id,
        name=row.name or "",
        designation=row.designation or "",
        subject=row.subject or "",
        class_assigned=row.class_assigned or "",
        phone=row.phone or "",
        email=row.email or "",
        photo_url=row.photo_url or "",
        photo_data=row.photo_data,
        date_joining=row.date_joining or "",
        monthly_salary=row.monthly_salary or "",
        guardian_name=row.guardian_name or "",
        gender=row.gender or "",
        experience=row.experience or "",
        national_id=row.national_id or "",
        religion=row.religion or "",
        education=row.education or "",
        blood_group=row.blood_group or "",
        date_of_birth=row.date_of_birth or "",
        home_address=row.home_address or "",
        login_enabled=bool(row.login_enabled),
        login_username=(row.login_username or "").strip(),
        has_login_password=bool((row.login_password_hash or "").strip()),
    )


@router.get("", response_model=list[schemas.FacultyRead])
def list_faculty(
    q: str | None = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    qt = (q or "").strip()
    qry = db.query(models.Faculty)
    if qt:
        pat = f"%{qt}%"
        qry = qry.filter(
            or_(
                models.Faculty.name.ilike(pat),
                models.Faculty.email.ilike(pat),
                models.Faculty.phone.ilike(pat),
                models.Faculty.login_username.ilike(pat),
            )
        )
    rows = qry.order_by(models.Faculty.name).offset(skip).limit(limit).all()
    return [_faculty_read(r) for r in rows]


@router.post("", response_model=schemas.FacultyRead)
def create_faculty(item: schemas.FacultyCreate, db: Session = Depends(get_db)):
    row = models.Faculty(**item.model_dump())
    row.login_enabled = True
    row.login_username = ""
    row.login_password_hash = _hash_portal_password(default_teacher_password_plain(row))
    db.add(row)
    db.commit()
    db.refresh(row)
    if not (row.login_username or "").strip():
        row.login_username = effective_teacher_username(row)
        db.commit()
        db.refresh(row)
    return _faculty_read(row)


@router.get("/{faculty_id}", response_model=schemas.FacultyRead)
def get_faculty(faculty_id: int, db: Session = Depends(get_db)):
    row = db.get(models.Faculty, faculty_id)
    if not row:
        raise HTTPException(status_code=404, detail="Faculty not found")
    return _faculty_read(row)


@router.put("/{faculty_id}", response_model=schemas.FacultyRead)
def update_faculty(
    faculty_id: int, item: schemas.FacultyCreate, db: Session = Depends(get_db)
):
    row = db.get(models.Faculty, faculty_id)
    if not row:
        raise HTTPException(status_code=404, detail="Faculty not found")
    for k, v in item.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return _faculty_read(row)


@router.patch("/{faculty_id}/portal-login", response_model=schemas.FacultyRead)
def patch_faculty_portal_login(
    faculty_id: int,
    item: schemas.FacultyPortalLoginPatch,
    db: Session = Depends(get_db),
):
    row = db.get(models.Faculty, faculty_id)
    if not row:
        raise HTTPException(status_code=404, detail="Faculty not found")

    if item.clear_password:
        row.login_password_hash = ""
        row.login_enabled = False
        db.commit()
        db.refresh(row)
        return _faculty_read(row)

    row.login_username = (item.login_username or "").strip()
    row.login_enabled = bool(item.login_enabled)

    pw = (item.new_password or "").strip()
    if pw:
        if len(pw) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        row.login_password_hash = _hash_portal_password(pw)

    if row.login_enabled and not (row.login_password_hash or "").strip():
        row.login_password_hash = _hash_portal_password(default_teacher_password_plain(row))

    db.commit()
    db.refresh(row)
    return _faculty_read(row)


@router.delete("/{faculty_id}")
def delete_faculty(faculty_id: int, db: Session = Depends(get_db)):
    row = db.get(models.Faculty, faculty_id)
    if not row:
        raise HTTPException(status_code=404, detail="Faculty not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
