from calendar import monthrange
from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from .auth_context import faculty_from_teacher_token, parse_bearer_payload

router = APIRouter(prefix="/attendance", tags=["attendance"])


def _month_bounds(year_month: str | None) -> tuple[date, date] | None:
    if not year_month or len(year_month) < 7:
        return None
    try:
        y = int(year_month[:4])
        m = int(year_month[5:7])
        first = date(y, m, 1)
        last = date(y, m, monthrange(y, m)[1])
        return first, last
    except ValueError:
        return None


def _teacher_att_class(fac: models.Faculty | None) -> str | None:
    if not fac:
        return None
    s = (fac.class_assigned or "").strip()
    return s or None


def _ensure_teacher_class(
    fac: models.Faculty | None, class_name: str, action: str = "access"
) -> None:
    ca = _teacher_att_class(fac)
    if not fac:
        return
    if not ca:
        raise HTTPException(
            status_code=403,
            detail="No class is assigned to your profile. Ask the admin to set "
            '"Class assigned" on your faculty record.',
        )
    if (class_name or "").strip() != ca:
        raise HTTPException(
            status_code=403,
            detail=f"Teachers may only {action} attendance for class: {ca}",
        )


@router.get("", response_model=list[schemas.AttendanceRead])
def list_attendance(
    class_name: str | None = None,
    section: str | None = None,
    on_date: date | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    year_month: str | None = Query(None, description="YYYY-MM"),
    admission_no: str | None = None,
    academic_year: str | None = None,
    status: str | None = Query(
        None, description="present | absent (omit for all)"
    ),
    skip: int = 0,
    limit: int = 5000,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(models.AttendanceRecord)
    payload = parse_bearer_payload(authorization)
    fac = faculty_from_teacher_token(payload, db)
    ca = _teacher_att_class(fac)
    if fac:
        if not ca:
            return []
        if class_name and class_name.strip() != ca:
            return []
        q = q.filter(models.AttendanceRecord.class_name == ca)
    elif class_name:
        q = q.filter(models.AttendanceRecord.class_name == class_name)
    if section is not None and section.strip() != "":
        q = q.filter(models.AttendanceRecord.section == section.strip())
    if on_date:
        q = q.filter(models.AttendanceRecord.date == on_date)
    ym = _month_bounds(year_month)
    if ym:
        q = q.filter(
            models.AttendanceRecord.date >= ym[0],
            models.AttendanceRecord.date <= ym[1],
        )
    if date_from:
        q = q.filter(models.AttendanceRecord.date >= date_from)
    if date_to:
        q = q.filter(models.AttendanceRecord.date <= date_to)
    if admission_no and admission_no.strip():
        adm = admission_no.strip()
        q = q.filter(func.trim(models.AttendanceRecord.admission_no) == adm)
    if academic_year is not None and academic_year.strip() != "":
        q = q.filter(
            models.AttendanceRecord.academic_year == academic_year.strip()
        )
    if status == "present":
        q = q.filter(models.AttendanceRecord.present.is_(True))
    elif status == "absent":
        q = q.filter(models.AttendanceRecord.present.is_(False))
    return (
        q.order_by(
            models.AttendanceRecord.date.desc(),
            models.AttendanceRecord.class_name,
            models.AttendanceRecord.student_name,
        )
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.post("", response_model=schemas.AttendanceRead)
def mark_attendance(
    item: schemas.AttendanceCreate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    payload = parse_bearer_payload(authorization)
    fac = faculty_from_teacher_token(payload, db)
    _ensure_teacher_class(fac, item.class_name, "record")
    row = models.AttendanceRecord(**item.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/bulk", response_model=list[schemas.AttendanceRead])
def bulk_mark(
    items: list[schemas.AttendanceCreate],
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    payload = parse_bearer_payload(authorization)
    fac = faculty_from_teacher_token(payload, db)
    for i in items:
        _ensure_teacher_class(fac, i.class_name, "record")
    rows = [models.AttendanceRecord(**i.model_dump()) for i in items]
    db.add_all(rows)
    db.commit()
    for r in rows:
        db.refresh(r)
    return rows


@router.post("/upsert-day", response_model=list[schemas.AttendanceRead])
def upsert_day(
    body: schemas.AttendanceUpsertDay,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    payload = parse_bearer_payload(authorization)
    fac = faculty_from_teacher_token(payload, db)
    class_name = body.class_name.strip()
    if not class_name:
        raise HTTPException(status_code=400, detail="class_name is required")
    _ensure_teacher_class(fac, class_name, "update")
    academic_year = (body.academic_year or "").strip()
    out: list[models.AttendanceRecord] = []
    for row in body.rows:
        adm = row.admission_no.strip()
        if not adm:
            continue
        existing = (
            db.query(models.AttendanceRecord)
            .filter(
                and_(
                    models.AttendanceRecord.admission_no == adm,
                    models.AttendanceRecord.date == body.date,
                )
            )
            .first()
        )
        payload = {
            "student_name": row.student_name.strip(),
            "admission_no": adm,
            "class_name": class_name,
            "section": (row.section or "").strip(),
            "date": body.date,
            "academic_year": academic_year,
            "present": row.present,
            "remarks": (row.remarks or "").strip(),
            "application_received": row.application_received,
            "application_notes": (row.application_notes or "").strip(),
        }
        if existing:
            for k, v in payload.items():
                setattr(existing, k, v)
            out.append(existing)
        else:
            rec = models.AttendanceRecord(**payload)
            db.add(rec)
            out.append(rec)
    db.commit()
    for r in out:
        db.refresh(r)
    return out


@router.put("/{record_id}", response_model=schemas.AttendanceRead)
def update_record(
    record_id: int,
    item: schemas.AttendanceCreate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    row = db.get(models.AttendanceRecord, record_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    payload = parse_bearer_payload(authorization)
    fac = faculty_from_teacher_token(payload, db)
    _ensure_teacher_class(fac, row.class_name, "edit")
    _ensure_teacher_class(fac, item.class_name, "edit")
    for k, v in item.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{record_id}")
def delete_record(
    record_id: int,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    row = db.get(models.AttendanceRecord, record_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    payload = parse_bearer_payload(authorization)
    fac = faculty_from_teacher_token(payload, db)
    _ensure_teacher_class(fac, row.class_name, "delete")
    db.delete(row)
    db.commit()
    return {"ok": True}
