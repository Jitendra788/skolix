import json
from calendar import monthrange
from datetime import date, timedelta
from typing import Literal

import bcrypt
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from .. import models, schemas
from ..services.academic_year import academic_year_for_date
from ..services.student_import import (
    build_student_create_from_row,
    parse_import_file,
    template_csv_bytes,
    template_xlsx_bytes,
)

router = APIRouter(prefix="/students", tags=["students"])

_MAX_ADMISSION_EXTRAS_LEN = 650_000


def _hash_portal_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def default_portal_password_plain(row: models.Student) -> str:
    """Plaintext rule: full name + date of birth (ISO); extend with admission no. if too short."""
    name = (row.full_name or "").strip()
    dob = (row.date_of_birth or "").strip()
    adm = (row.admission_no or "").strip()
    base = f"{name}{dob}"
    if len(base) < 6:
        base = f"{name}{dob}{adm}"
    if len(base) < 6:
        base = f"{adm}-portal" if adm else "student-portal"
    return base


def _apply_default_portal_credentials(row: models.Student) -> None:
    plain = default_portal_password_plain(row)
    row.login_enabled = True
    row.login_password_hash = _hash_portal_password(plain)


def sync_students_missing_portal_passwords(db: Session) -> int:
    """
    For every student with no stored password hash: enable login and set the default password.
    Safe to run on startup; skips rows that already have a hash.
    """
    rows = db.query(models.Student).all()
    updated = 0
    for row in rows:
        if (row.login_password_hash or "").strip():
            continue
        _apply_default_portal_credentials(row)
        updated += 1
    if updated:
        db.commit()
    return updated


def _effective_login_username(row: models.Student) -> str:
    custom = (getattr(row, "login_username", None) or "").strip()
    if custom:
        return custom
    return (row.admission_no or "").strip()


def _assert_portal_login_unique(
    db: Session, student_id: int, row: models.Student, enabled: bool
) -> None:
    if not enabled:
        return
    eff = _effective_login_username(row).lower()
    if not eff:
        raise HTTPException(
            status_code=400, detail="Cannot enable login without an admission number or username"
        )
    others = (
        db.query(models.Student)
        .filter(
            models.Student.id != student_id,
            models.Student.login_enabled.is_(True),
        )
        .all()
    )
    for o in others:
        if _effective_login_username(o).lower() == eff:
            raise HTTPException(
                status_code=400, detail="Login id already in use by another student"
            )


def _parse_admission_extras(raw: str | None) -> dict:
    if not raw or not str(raw).strip():
        return {}
    try:
        out = json.loads(raw)
        return out if isinstance(out, dict) else {}
    except Exception:
        return {}


def _serialize_admission_extras(extras: dict | None) -> str:
    payload = extras if isinstance(extras, dict) else {}
    s = json.dumps(payload, ensure_ascii=False)
    if len(s) > _MAX_ADMISSION_EXTRAS_LEN:
        raise HTTPException(status_code=400, detail="Admission data too large (photo or notes).")
    return s


def _student_read(row: models.Student) -> schemas.StudentRead:
    pwd = (getattr(row, "login_password_hash", None) or "").strip()
    return schemas.StudentRead(
        id=row.id,
        admission_no=row.admission_no,
        full_name=row.full_name,
        class_name=row.class_name,
        section=row.section or "",
        parent_phone=row.parent_phone or "",
        parent_name=row.parent_name or "",
        date_of_birth=row.date_of_birth or "",
        gender=row.gender or "",
        admission_extras=_parse_admission_extras(getattr(row, "admission_extras", None)),
        login_enabled=bool(getattr(row, "login_enabled", False)),
        login_username=(getattr(row, "login_username", None) or "").strip(),
        has_login_password=bool(pwd),
    )


def _session_year_from_extras_dict(extras: dict) -> str | None:
    raw = extras.get("date_of_admission")
    if not isinstance(raw, str) or not str(raw).strip():
        return None
    iso = str(raw).strip()[:10]
    parts = iso.split("-")
    if len(parts) != 3:
        return None
    try:
        y, mo, d = int(parts[0]), int(parts[1]), int(parts[2])
        dd = date(y, mo, d)
    except Exception:
        return None
    return academic_year_for_date(dd)


def _session_year_from_read(s: schemas.StudentRead) -> str | None:
    ex = s.admission_extras
    if not isinstance(ex, dict):
        return None
    return _session_year_from_extras_dict(ex)


def _student_search_blob(s: schemas.StudentRead) -> str:
    ex = s.admission_extras if isinstance(s.admission_extras, dict) else {}
    parts = [
        (s.admission_no or "").lower(),
        (s.full_name or "").lower(),
        (s.parent_phone or "").lower(),
        (s.parent_name or "").lower(),
        str(ex.get("previous_board_roll") or "").lower(),
        str(ex.get("father_mobile") or "").lower(),
        str(ex.get("mother_mobile") or "").lower(),
    ]
    return " ".join(parts)


def _student_matches_search(s: schemas.StudentRead, term: str) -> bool:
    return term in _student_search_blob(s)


def _filtered_student_reads_all(
    db: Session,
    class_name: str | None,
    section: str | None,
    academic_year: str | None,
    q: str | None,
    skip: int,
    limit: int,
) -> list[schemas.StudentRead]:
    cn = (class_name or "").strip()
    sec = (section or "").strip()
    ay = (academic_year or "").strip()
    qt = (q or "").strip().lower()

    qry = db.query(models.Student)
    if cn:
        qry = qry.filter(models.Student.class_name == cn)
    if sec and sec != "*":
        qry = qry.filter(models.Student.section == sec)

    fetch_cap = 4000 if (ay or qt) else max(limit + skip, 500)
    rows = (
        qry.order_by(models.Student.section, models.Student.full_name)
        .offset(0)
        .limit(min(fetch_cap, 8000))
        .all()
    )
    out = [_student_read(r) for r in rows]
    if ay and cn:
        out = [s for s in out if _session_year_from_read(s) == ay]
    if qt and cn:
        out = [s for s in out if _student_matches_search(s, qt)]
    return out


def _month_window(d: date) -> tuple[date, date]:
    first = date(d.year, d.month, 1)
    last = date(d.year, d.month, monthrange(d.year, d.month)[1])
    return first, last


def _attendance_bucket(row: models.AttendanceRecord) -> str:
    if row.present:
        return "present"
    if row.application_received:
        return "leave"
    return "absent"


def _day_mark(
    db: Session, admission_no: str, day: date
) -> schemas.StudentReportDayMark:
    rec = (
        db.query(models.AttendanceRecord)
        .filter(
            models.AttendanceRecord.admission_no == admission_no,
            models.AttendanceRecord.date == day,
        )
        .first()
    )
    if not rec:
        return schemas.StudentReportDayMark(
            label=day.isoformat(), status="NOT_MARKED"
        )
    b = _attendance_bucket(rec)
    if b == "present":
        st = "PRESENT"
    elif b == "leave":
        st = "ON_LEAVE"
    else:
        st = "ABSENT"
    return schemas.StudentReportDayMark(label=day.isoformat(), status=st)


def _aggregate_attendance(
    db: Session, admission_no: str, first: date | None, last: date | None
) -> tuple[int, int, int]:
    """Returns (presents, leaves, absents) for optional inclusive date range."""
    q = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.admission_no == admission_no
    )
    if first is not None and last is not None:
        q = q.filter(
            models.AttendanceRecord.date >= first,
            models.AttendanceRecord.date <= last,
        )
    rows = q.all()
    p = le = ab = 0
    for r in rows:
        b = _attendance_bucket(r)
        if b == "present":
            p += 1
        elif b == "leave":
            le += 1
        else:
            ab += 1
    return p, le, ab


def _pct(p: int, le: int, ab: int) -> int:
    denom = p + le + ab
    if denom <= 0:
        return 0
    return int(round(100 * p / denom))


def persist_new_student(db: Session, item: schemas.StudentCreate) -> schemas.StudentRead:
    data = item.model_dump()
    extras = data.pop("admission_extras", None) or {}
    if not isinstance(extras, dict):
        extras = {}
    data["admission_no"] = data["admission_no"].strip()
    data["full_name"] = data["full_name"].strip()
    data["class_name"] = data["class_name"].strip()
    data["section"] = (data.get("section") or "").strip()
    data["parent_phone"] = (data.get("parent_phone") or "").strip()
    data["parent_name"] = (data.get("parent_name") or "").strip()
    data["date_of_birth"] = (data.get("date_of_birth") or "").strip()
    data["gender"] = (data.get("gender") or "").strip()
    try:
        data["admission_extras"] = _serialize_admission_extras(extras)
    except HTTPException as e:
        detail = e.detail
        msg = detail if isinstance(detail, str) else "Admission data rejected"
        raise ValueError(msg) from e
    exists = (
        db.query(models.Student)
        .filter(models.Student.admission_no == data["admission_no"])
        .first()
    )
    if exists:
        raise ValueError("Admission number already exists")
    row = models.Student(**data)
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ValueError("Admission number already exists") from None
    db.refresh(row)
    _apply_default_portal_credentials(row)
    db.commit()
    db.refresh(row)
    return _student_read(row)


@router.get("/last-admission", response_model=schemas.StudentLastAdmission)
def last_admission_number(db: Session = Depends(get_db)):
    row = db.query(models.Student).order_by(models.Student.id.desc()).first()
    if not row:
        return schemas.StudentLastAdmission(last_admission_no="")
    return schemas.StudentLastAdmission(last_admission_no=(row.admission_no or "").strip())


@router.get("/import-template")
def student_import_template(
    download_format: Literal["csv", "xlsx"] = Query(
        "csv",
        alias="format",
        description="Sample file type: csv or xlsx",
    ),
):
    if download_format == "csv":
        body = template_csv_bytes()
        return Response(
            content=body,
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": (
                    'attachment; filename="student_admission_import_sample.csv"'
                )
            },
        )
    body = template_xlsx_bytes()
    return Response(
        content=body,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": (
                'attachment; filename="student_admission_import_sample.xlsx"'
            )
        },
    )


@router.post("/import", response_model=schemas.StudentBulkImportResult)
async def student_bulk_import(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    raw = await file.read()
    rows, parse_err = parse_import_file(raw, file.filename or "")
    if parse_err:
        raise HTTPException(status_code=400, detail=parse_err)

    class_names = {
        (r.name or "").strip()
        for r in db.query(models.SchoolClass).all()
        if (r.name or "").strip()
    }
    if not class_names:
        raise HTTPException(
            status_code=400,
            detail="No school classes are configured. Add classes under School setup first.",
        )

    submitted: list[schemas.StudentImportSuccessItem] = []
    failed: list[schemas.StudentImportFailureItem] = []
    seen_adm: set[str] = set()

    for row_number, row in rows:
        adm_key = (row.get("admission_no") or "").strip().lower()
        fn_preview = (row.get("full_name") or "").strip()
        if adm_key in seen_adm:
            failed.append(
                schemas.StudentImportFailureItem(
                    row_number=row_number,
                    admission_no=(row.get("admission_no") or "").strip(),
                    full_name=fn_preview,
                    reason="Duplicate admission_no in this file (same registration number appears more than once).",
                )
            )
            continue
        if adm_key:
            seen_adm.add(adm_key)

        payload, build_err = build_student_create_from_row(row, class_names)
        if build_err or payload is None:
            failed.append(
                schemas.StudentImportFailureItem(
                    row_number=row_number,
                    admission_no=(row.get("admission_no") or "").strip(),
                    full_name=fn_preview,
                    reason=build_err or "Invalid row.",
                )
            )
            continue

        try:
            created = persist_new_student(db, payload)
        except ValueError as e:
            failed.append(
                schemas.StudentImportFailureItem(
                    row_number=row_number,
                    admission_no=payload.admission_no,
                    full_name=payload.full_name,
                    reason=str(e),
                )
            )
            continue

        submitted.append(
            schemas.StudentImportSuccessItem(
                row_number=row_number,
                admission_no=created.admission_no,
                full_name=created.full_name,
                class_name=created.class_name,
            )
        )

    return schemas.StudentBulkImportResult(
        file_name=file.filename or "upload",
        total_rows=len(rows),
        success_count=len(submitted),
        failure_count=len(failed),
        submitted=submitted,
        failed=failed,
    )


@router.get("/page", response_model=schemas.StudentListPage)
def list_students_page(
    class_name: str | None = None,
    section: str | None = None,
    academic_year: str | None = None,
    q: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=200),
    db: Session = Depends(get_db),
):
    out = _filtered_student_reads_all(
        db, class_name, section, academic_year, q, skip, limit
    )
    total = len(out)
    return schemas.StudentListPage(
        items=out[skip : skip + limit],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.get(
    "/portal-login/page",
    response_model=schemas.StudentListPage,
)
def list_students_portal_login_page(
    q: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Paged roster for the admin Student login screen (server-side search + count)."""
    qt = (q or "").strip()
    qry = db.query(models.Student)
    if qt:
        pat = f"%{qt}%"
        qry = qry.filter(
            or_(
                models.Student.full_name.ilike(pat),
                models.Student.admission_no.ilike(pat),
                models.Student.class_name.ilike(pat),
                models.Student.login_username.ilike(pat),
            )
        )
    total = qry.count()
    rows = (
        qry.order_by(models.Student.full_name)
        .offset(skip)
        .limit(limit)
        .all()
    )
    return schemas.StudentListPage(
        items=[_student_read(r) for r in rows],
        total=total,
        skip=skip,
        limit=limit,
    )


@router.post(
    "/portal-login/apply-default-passwords",
    response_model=schemas.PortalLoginDefaultsResult,
)
def apply_default_portal_passwords_bulk(db: Session = Depends(get_db)):
    """
    For students with no portal password yet: enable login and set password to
    name + date of birth (same rule as new admissions). Skips rows that already have a hash.
    """
    n = sync_students_missing_portal_passwords(db)
    return schemas.PortalLoginDefaultsResult(updated=n)


@router.get("/{student_id}/report", response_model=schemas.StudentReportResponse)
def student_report(student_id: int, db: Session = Depends(get_db)):
    student = db.get(models.Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    adm = student.admission_no.strip()

    today = date.today()
    yday = today - timedelta(days=1)
    m0, m1 = _month_window(today)
    month_label = today.strftime("%b %Y")

    pt, lt, at = _aggregate_attendance(db, adm, None, None)
    pm, lm, am = _aggregate_attendance(db, adm, m0, m1)

    fee_row = schemas.StudentReportFee()
    sf = (
        db.query(models.StudentFee)
        .options(joinedload(models.StudentFee.installments))
        .filter(
            models.StudentFee.admission_no == adm,
            models.StudentFee.class_name == student.class_name,
        )
        .order_by(models.StudentFee.id.desc())
        .first()
    )
    if not sf:
        sf = (
            db.query(models.StudentFee)
            .options(joinedload(models.StudentFee.installments))
            .filter(models.StudentFee.admission_no == adm)
            .order_by(models.StudentFee.id.desc())
            .first()
        )

    if sf:
        gross = float(sf.gross_total or 0)
        disc = float(sf.discount_amount or 0)
        disc_pct = int(round(100 * disc / gross)) if gross > 0 else 0
        month_insts = [
            i
            for i in (sf.installments or [])
            if i.due_date.month == today.month and i.due_date.year == today.year
        ]
        if month_insts:
            period_due = sum(float(i.amount) for i in month_insts)
            period_paid = sum(float(i.amount_paid) for i in month_insts)
            period_label = today.strftime("%B, %Y")
        else:
            period_due = float(sf.total_due or 0)
            period_paid = float(sf.total_paid or 0)
            period_label = sf.academic_year or "Annual"
        bal = max(0.0, period_due - period_paid)
        if period_due <= 0:
            st = "none"
        elif bal <= 0.009:
            st = "paid"
        elif period_paid <= 0.009:
            st = "unpaid"
        else:
            st = "partially_paid"
        fee_row = schemas.StudentReportFee(
            has_record=True,
            period_label=period_label,
            period_due=round(period_due, 2),
            period_paid=round(period_paid, 2),
            balance=round(bal, 2),
            status=st,
            academic_year=sf.academic_year or "",
        )
    else:
        disc_pct = 0

    profile = schemas.StudentReportProfile(
        id=student.id,
        full_name=student.full_name,
        admission_no=student.admission_no,
        class_name=student.class_name,
        section=student.section or "",
        parent_name=student.parent_name or "",
        parent_phone=student.parent_phone or "",
        date_of_birth=student.date_of_birth or "",
        date_of_admission=None,
        discount_fee_percent=disc_pct if sf else 0,
    )

    promo_rows = (
        db.query(models.StudentPromotionLog)
        .filter(models.StudentPromotionLog.student_id == student.id)
        .order_by(models.StudentPromotionLog.changed_at.desc())
        .all()
    )
    promotions = [
        schemas.StudentPromotionLogRead(
            from_class=(p.from_class or "").strip(),
            to_class=(p.to_class or "").strip(),
            changed_at=p.changed_at,
        )
        for p in promo_rows
    ]

    return schemas.StudentReportResponse(
        profile=profile,
        attendance=schemas.StudentReportAttendance(
            presents_total=pt,
            leaves_total=lt,
            absents_total=at,
            presents_this_month=pm,
            leaves_this_month=lm,
            absents_this_month=am,
            overall_percent=_pct(pt, lt, at),
            month_percent=_pct(pm, lm, am),
            month_label=month_label,
            today=_day_mark(db, adm, today),
            yesterday=_day_mark(db, adm, yday),
        ),
        class_tests=[],
        examinations=schemas.StudentReportExamBlock(has_records=False),
        fee=fee_row,
        promotions=promotions,
    )


@router.get("/{student_id}", response_model=schemas.StudentRead)
def get_student(student_id: int, db: Session = Depends(get_db)):
    row = db.get(models.Student, student_id)
    if not row:
        raise HTTPException(status_code=404, detail="Student not found")
    return _student_read(row)


@router.get("", response_model=list[schemas.StudentRead])
def list_students(
    class_name: str | None = None,
    section: str | None = None,
    academic_year: str | None = None,
    q: str | None = None,
    skip: int = 0,
    limit: int = 500,
    db: Session = Depends(get_db),
):
    out = _filtered_student_reads_all(
        db, class_name, section, academic_year, q, skip, limit
    )
    return out[skip : skip + limit]


@router.post("", response_model=schemas.StudentRead)
def create_student(item: schemas.StudentCreate, db: Session = Depends(get_db)):
    try:
        return persist_new_student(db, item)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/{student_id}", response_model=schemas.StudentRead)
def update_student(
    student_id: int, item: schemas.StudentCreate, db: Session = Depends(get_db)
):
    row = db.get(models.Student, student_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    data = item.model_dump()
    old_class_name = (row.class_name or "").strip()
    extras = data.pop("admission_extras", None) or {}
    if not isinstance(extras, dict):
        extras = {}
    data["admission_no"] = data["admission_no"].strip()
    data["full_name"] = data["full_name"].strip()
    data["class_name"] = data["class_name"].strip()
    data["section"] = (data.get("section") or "").strip()
    data["parent_phone"] = (data.get("parent_phone") or "").strip()
    data["parent_name"] = (data.get("parent_name") or "").strip()
    data["date_of_birth"] = (data.get("date_of_birth") or "").strip()
    data["gender"] = (data.get("gender") or "").strip()
    data["admission_extras"] = _serialize_admission_extras(extras)
    other = (
        db.query(models.Student)
        .filter(
            models.Student.admission_no == data["admission_no"],
            models.Student.id != student_id,
        )
        .first()
    )
    if other:
        raise HTTPException(status_code=400, detail="Admission number already in use")
    for k, v in data.items():
        setattr(row, k, v)
    new_class_name = (row.class_name or "").strip()
    if old_class_name and new_class_name and old_class_name != new_class_name:
        db.add(
            models.StudentPromotionLog(
                student_id=row.id,
                admission_no=(row.admission_no or "").strip(),
                from_class=old_class_name,
                to_class=new_class_name,
            )
        )
    db.commit()
    db.refresh(row)
    return _student_read(row)


@router.patch("/{student_id}/portal-login", response_model=schemas.StudentRead)
def patch_student_portal_login(
    student_id: int,
    item: schemas.StudentPortalLoginPatch,
    db: Session = Depends(get_db),
):
    row = db.get(models.Student, student_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")

    if item.clear_password:
        row.login_password_hash = ""
        row.login_enabled = False
        db.commit()
        db.refresh(row)
        return _student_read(row)

    row.login_username = (item.login_username or "").strip()

    if item.login_enabled:
        _assert_portal_login_unique(db, student_id, row, True)
        existing_hash = (row.login_password_hash or "").strip()
        pw = (item.new_password or "").strip()
        if pw:
            if len(pw) < 6:
                raise HTTPException(
                    status_code=400, detail="Password must be at least 6 characters"
                )
            row.login_password_hash = _hash_portal_password(pw)
            row.login_enabled = True
        elif existing_hash:
            row.login_enabled = True
        else:
            _apply_default_portal_credentials(row)
    else:
        row.login_enabled = False

    db.commit()
    db.refresh(row)
    return _student_read(row)


@router.delete("/{student_id}")
def delete_student(student_id: int, db: Session = Depends(get_db)):
    row = db.get(models.Student, student_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
