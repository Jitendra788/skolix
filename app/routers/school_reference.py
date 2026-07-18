import re
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..services.academic_year import academic_year_for_date

router = APIRouter(prefix="/school", tags=["school"])


def _normalize_unique_section_codes(codes: list[str]) -> list[str]:
    """Uppercase, trim, dedupe; raise 400 on duplicates in input."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in codes:
        s = (raw or "").strip().upper()
        if not s:
            continue
        if len(s) > 10:
            raise HTTPException(
                status_code=400,
                detail=f"Section code too long (max 10 characters): {raw!r}",
            )
        if s in seen:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate section in request: {s}",
            )
        seen.add(s)
        out.append(s)
    return out


def _school_class_read(db: Session, row: models.SchoolClass) -> schemas.SchoolClassRead:
    secs = (
        db.query(models.SchoolClassSection)
        .filter(models.SchoolClassSection.class_id == row.id)
        .order_by(
            models.SchoolClassSection.sort_order,
            models.SchoolClassSection.section_code,
        )
        .all()
    )
    return schemas.SchoolClassRead(
        id=row.id,
        name=row.name,
        sort_order=row.sort_order,
        monthly_tuition=getattr(row, "monthly_tuition", "") or "",
        class_teacher=getattr(row, "class_teacher", "") or "",
        sections=[s.section_code for s in secs],
    )


# Seeds default fee-head rows (particular_key + labels). Fees Particulars / fee structure use *all* fee heads.
FEE_PARTICULAR_SPECS: list[tuple[str, str, int, str, bool]] = [
    ("monthly_tuition", "MONTHLY TUITION FEE", 1, "FIXED", False),
    ("admission", "ADMISSION FEE", 2, "0", False),
    ("registration", "REGISTRATION FEE", 3, "0", False),
    ("art_material", "ART MATERIAL", 4, "0", False),
    ("transport", "TRANSPORT", 5, "0", False),
    ("books", "BOOKS", 6, "0", False),
    ("uniform", "UNIFORM", 7, "0", False),
    ("fine", "FINE", 8, "0", False),
    ("others", "OTHERS", 9, "0", False),
    ("previous_balance", "PREVIOUS BALANCE", 10, "FIXED", False),
    ("discount_fixed", "DISCOUNT IN FEE [FIXED]", 11, "FIXED", False),
]


def ensure_fee_particular_rows(db: Session) -> None:
    """Insert missing template fee heads; does not overwrite existing keys."""
    for key, name, sort_order, prefix, locked in FEE_PARTICULAR_SPECS:
        row = (
            db.query(models.SchoolFeeHead)
            .filter(models.SchoolFeeHead.particular_key == key)
            .first()
        )
        if row:
            continue
        db.add(
            models.SchoolFeeHead(
                particular_key=key,
                name=name,
                sort_order=sort_order,
                prefix_amount=prefix,
                is_locked=locked,
            )
        )
    keys = [t[0] for t in FEE_PARTICULAR_SPECS]
    db.query(models.SchoolFeeHead).filter(
        models.SchoolFeeHead.particular_key.in_(keys)
    ).update({models.SchoolFeeHead.is_locked: False}, synchronize_session=False)
    db.commit()


@router.get("/current-academic-year", response_model=schemas.CurrentAcademicYearRead)
def get_current_academic_year(
    as_of: date | None = Query(None, description="Reference date for AY calculation"),
):
    d = as_of or date.today()
    return schemas.CurrentAcademicYearRead(
        academic_year=academic_year_for_date(d),
        as_of_date=d,
    )


@router.get("/classes", response_model=list[schemas.SchoolClassRead])
def list_classes(db: Session = Depends(get_db)):
    rows = (
        db.query(models.SchoolClass)
        .order_by(models.SchoolClass.sort_order, models.SchoolClass.name)
        .all()
    )
    return [_school_class_read(db, r) for r in rows]


@router.get("/subjects/by-class", response_model=list[schemas.ClassSubjectsOverviewRow])
def subjects_by_class_overview(db: Session = Depends(get_db)):
    classes = (
        db.query(models.SchoolClass)
        .order_by(models.SchoolClass.sort_order, models.SchoolClass.name)
        .all()
    )
    out: list[schemas.ClassSubjectsOverviewRow] = []
    for sc in classes:
        subs = (
            db.query(models.ClassSubject)
            .filter(models.ClassSubject.class_id == sc.id)
            .order_by(models.ClassSubject.sort_order, models.ClassSubject.id)
            .all()
        )
        out.append(
            schemas.ClassSubjectsOverviewRow(
                class_id=sc.id,
                class_name=sc.name,
                subjects=[schemas.ClassSubjectRead.model_validate(s) for s in subs],
            )
        )
    return out


@router.put("/classes/reorder", response_model=list[schemas.SchoolClassRead])
def reorder_classes(body: schemas.SchoolClassReorder, db: Session = Depends(get_db)):
    ids = list(body.class_ids)
    rows = db.query(models.SchoolClass).all()
    all_ids = {r.id for r in rows}
    if not all_ids:
        if ids:
            raise HTTPException(
                status_code=400,
                detail="class_ids must be empty when there are no classes.",
            )
        return []
    if not ids or set(ids) != all_ids or len(ids) != len(all_ids):
        raise HTTPException(
            status_code=400,
            detail="class_ids must list every class exactly once.",
        )
    id_to_row = {r.id: r for r in rows}
    for i, cid in enumerate(ids):
        id_to_row[cid].sort_order = i * 10
    db.commit()
    ordered = (
        db.query(models.SchoolClass)
        .order_by(models.SchoolClass.sort_order, models.SchoolClass.name)
        .all()
    )
    return [_school_class_read(db, r) for r in ordered]


@router.post("/classes", response_model=schemas.SchoolClassRead)
def create_class(item: schemas.SchoolClassCreate, db: Session = Depends(get_db)):
    name = item.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    exists = db.query(models.SchoolClass).filter(models.SchoolClass.name == name).first()
    if exists:
        raise HTTPException(status_code=400, detail="Class name already exists")
    max_so = db.query(func.max(models.SchoolClass.sort_order)).scalar()
    next_so = (max_so if max_so is not None else 0) + 10
    row = models.SchoolClass(
        name=name,
        sort_order=next_so,
        monthly_tuition=(item.monthly_tuition or "").strip()[:40],
        class_teacher=(item.class_teacher or "").strip()[:200],
    )
    db.add(row)
    db.flush()
    if item.initial_sections:
        try:
            codes = _normalize_unique_section_codes(list(item.initial_sections))
        except HTTPException:
            db.rollback()
            raise
        for i, code in enumerate(codes):
            db.add(
                models.SchoolClassSection(
                    class_id=row.id,
                    section_code=code,
                    sort_order=i * 10,
                )
            )
    db.commit()
    db.refresh(row)
    return _school_class_read(db, row)


@router.put("/classes/{class_id}", response_model=schemas.SchoolClassRead)
def update_class(
    class_id: int, item: schemas.SchoolClassCreate, db: Session = Depends(get_db)
):
    row = db.get(models.SchoolClass, class_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    name = item.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    other = (
        db.query(models.SchoolClass)
        .filter(models.SchoolClass.name == name, models.SchoolClass.id != class_id)
        .first()
    )
    if other:
        raise HTTPException(status_code=400, detail="Name already in use")
    row.name = name
    row.sort_order = item.sort_order
    row.monthly_tuition = (item.monthly_tuition or "").strip()[:40]
    row.class_teacher = (item.class_teacher or "").strip()[:200]
    db.commit()
    db.refresh(row)
    return _school_class_read(db, row)


@router.put("/classes/{class_id}/sections", response_model=schemas.SchoolClassRead)
def put_class_sections(
    class_id: int,
    body: schemas.SchoolClassSectionsPut,
    db: Session = Depends(get_db),
):
    row = db.get(models.SchoolClass, class_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    codes = _normalize_unique_section_codes(list(body.section_codes))
    db.query(models.SchoolClassSection).filter(
        models.SchoolClassSection.class_id == class_id
    ).delete(synchronize_session=False)
    for i, code in enumerate(codes):
        db.add(
            models.SchoolClassSection(
                class_id=class_id,
                section_code=code,
                sort_order=i * 10,
            )
        )
    db.commit()
    return _school_class_read(db, row)


def _normalize_subject_rows(
    rows: list[schemas.ClassSubjectRowPut],
) -> list[tuple[str, str]]:
    seen: set[str] = set()
    out: list[tuple[str, str]] = []
    for r in rows:
        name = (r.subject_name or "").strip()
        if not name:
            continue
        if len(name) > 120:
            raise HTTPException(
                status_code=400,
                detail=f"Subject name too long (max 120 characters): {name!r}",
            )
        key = name.upper()
        if key in seen:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate subject name in request: {name}",
            )
        seen.add(key)
        marks = (r.total_marks or "").strip()[:40]
        out.append((name, marks))
    return out


@router.get("/classes/{class_id}/subjects", response_model=list[schemas.ClassSubjectRead])
def list_class_subjects(class_id: int, db: Session = Depends(get_db)):
    row = db.get(models.SchoolClass, class_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    subs = (
        db.query(models.ClassSubject)
        .filter(models.ClassSubject.class_id == class_id)
        .order_by(models.ClassSubject.sort_order, models.ClassSubject.id)
        .all()
    )
    return [schemas.ClassSubjectRead.model_validate(s) for s in subs]


@router.put("/classes/{class_id}/subjects", response_model=list[schemas.ClassSubjectRead])
def put_class_subjects(
    class_id: int,
    body: schemas.ClassSubjectsPut,
    db: Session = Depends(get_db),
):
    row = db.get(models.SchoolClass, class_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    pairs = _normalize_subject_rows(list(body.rows))
    db.query(models.ClassSubject).filter(
        models.ClassSubject.class_id == class_id
    ).delete(synchronize_session=False)
    for i, (name, marks) in enumerate(pairs):
        db.add(
            models.ClassSubject(
                class_id=class_id,
                subject_name=name,
                total_marks=marks,
                sort_order=i * 10,
            )
        )
    db.commit()
    subs = (
        db.query(models.ClassSubject)
        .filter(models.ClassSubject.class_id == class_id)
        .order_by(models.ClassSubject.sort_order, models.ClassSubject.id)
        .all()
    )
    return [schemas.ClassSubjectRead.model_validate(s) for s in subs]


@router.delete("/classes/{class_id}")
def delete_class(class_id: int, db: Session = Depends(get_db)):
    row = db.get(models.SchoolClass, class_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/academic-years", response_model=list[schemas.SchoolAcademicYearRead])
def list_academic_years(db: Session = Depends(get_db)):
    return (
        db.query(models.SchoolAcademicYear)
        .order_by(models.SchoolAcademicYear.sort_order, models.SchoolAcademicYear.label)
        .all()
    )


@router.post("/academic-years", response_model=schemas.SchoolAcademicYearRead)
def create_academic_year(
    item: schemas.SchoolAcademicYearCreate, db: Session = Depends(get_db)
):
    label = item.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="Label is required")
    exists = (
        db.query(models.SchoolAcademicYear)
        .filter(models.SchoolAcademicYear.label == label)
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="Academic year already exists")
    if item.is_current:
        db.query(models.SchoolAcademicYear).update(
            {models.SchoolAcademicYear.is_current: False},
            synchronize_session=False,
        )
    row = models.SchoolAcademicYear(
        label=label, sort_order=item.sort_order, is_current=item.is_current
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/academic-years/{year_id}", response_model=schemas.SchoolAcademicYearRead)
def update_academic_year(
    year_id: int, item: schemas.SchoolAcademicYearCreate, db: Session = Depends(get_db)
):
    row = db.get(models.SchoolAcademicYear, year_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    label = item.label.strip()
    if not label:
        raise HTTPException(status_code=400, detail="Label is required")
    other = (
        db.query(models.SchoolAcademicYear)
        .filter(
            models.SchoolAcademicYear.label == label,
            models.SchoolAcademicYear.id != year_id,
        )
        .first()
    )
    if other:
        raise HTTPException(status_code=400, detail="Label already in use")
    if item.is_current:
        db.query(models.SchoolAcademicYear).update(
            {models.SchoolAcademicYear.is_current: False},
            synchronize_session=False,
        )
    row.label = label
    row.sort_order = item.sort_order
    row.is_current = item.is_current
    db.commit()
    db.refresh(row)
    return row


@router.delete("/academic-years/{year_id}")
def delete_academic_year(year_id: int, db: Session = Depends(get_db)):
    row = db.get(models.SchoolAcademicYear, year_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/fee-particulars", response_model=list[schemas.SchoolFeeHeadRead])
def list_fee_particulars(db: Session = Depends(get_db)):
    """Same ordered list as fee heads / fee structure matrix (unified vocabulary)."""
    ensure_fee_particular_rows(db)
    return (
        db.query(models.SchoolFeeHead)
        .order_by(models.SchoolFeeHead.sort_order, models.SchoolFeeHead.name)
        .all()
    )


@router.get("/fee-heads", response_model=list[schemas.SchoolFeeHeadRead])
def list_fee_heads(db: Session = Depends(get_db)):
    return (
        db.query(models.SchoolFeeHead)
        .order_by(models.SchoolFeeHead.sort_order, models.SchoolFeeHead.name)
        .all()
    )


@router.post("/fee-heads", response_model=schemas.SchoolFeeHeadRead)
def create_fee_head(item: schemas.SchoolFeeHeadCreate, db: Session = Depends(get_db)):
    name = item.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    exists = db.query(models.SchoolFeeHead).filter(models.SchoolFeeHead.name == name).first()
    if exists:
        raise HTTPException(status_code=400, detail="Fee head already exists")
    row = models.SchoolFeeHead(
        name=name,
        sort_order=item.sort_order,
        prefix_amount=(item.prefix_amount or "0").strip()[:40],
        is_locked=False,
        particular_key=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/fee-heads/{head_id}", response_model=schemas.SchoolFeeHeadRead)
def update_fee_head(
    head_id: int, item: schemas.SchoolFeeHeadCreate, db: Session = Depends(get_db)
):
    row = db.get(models.SchoolFeeHead, head_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    name = item.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    other = (
        db.query(models.SchoolFeeHead)
        .filter(models.SchoolFeeHead.name == name, models.SchoolFeeHead.id != head_id)
        .first()
    )
    if other:
        raise HTTPException(status_code=400, detail="Name already in use")
    row.name = name
    row.sort_order = item.sort_order
    row.prefix_amount = (item.prefix_amount or "0").strip()[:40]
    row.is_locked = item.is_locked
    db.commit()
    db.refresh(row)
    return row


@router.delete("/fee-heads/{head_id}")
def delete_fee_head(head_id: int, db: Session = Depends(get_db)):
    row = db.get(models.SchoolFeeHead, head_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    if row.particular_key is not None:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete a fee particulars row from school setup",
        )
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/fee-frequencies", response_model=list[schemas.SchoolFeeFrequencyRead])
def list_fee_frequencies(db: Session = Depends(get_db)):
    return (
        db.query(models.SchoolFeeFrequency)
        .order_by(models.SchoolFeeFrequency.sort_order, models.SchoolFeeFrequency.name)
        .all()
    )


@router.post("/fee-frequencies", response_model=schemas.SchoolFeeFrequencyRead)
def create_fee_frequency(
    item: schemas.SchoolFeeFrequencyCreate, db: Session = Depends(get_db)
):
    name = item.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    exists = (
        db.query(models.SchoolFeeFrequency)
        .filter(models.SchoolFeeFrequency.name == name)
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="Frequency already exists")
    row = models.SchoolFeeFrequency(name=name, sort_order=item.sort_order)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/fee-frequencies/{freq_id}", response_model=schemas.SchoolFeeFrequencyRead)
def update_fee_frequency(
    freq_id: int, item: schemas.SchoolFeeFrequencyCreate, db: Session = Depends(get_db)
):
    row = db.get(models.SchoolFeeFrequency, freq_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    name = item.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    other = (
        db.query(models.SchoolFeeFrequency)
        .filter(
            models.SchoolFeeFrequency.name == name,
            models.SchoolFeeFrequency.id != freq_id,
        )
        .first()
    )
    if other:
        raise HTTPException(status_code=400, detail="Name already in use")
    row.name = name
    row.sort_order = item.sort_order
    db.commit()
    db.refresh(row)
    return row


@router.delete("/fee-frequencies/{freq_id}")
def delete_fee_frequency(freq_id: int, db: Session = Depends(get_db)):
    row = db.get(models.SchoolFeeFrequency, freq_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


def _fmt_amount(a: float) -> str:
    if abs(a - int(a)) < 1e-9:
        return str(int(a))
    s = f"{a:.4f}".rstrip("0").rstrip(".")
    return s or "0"


def _parse_amount_for_structure(s: str) -> float:
    t = (s or "").strip().upper()
    if t in ("", "FIXED", "—", "-", "N/A"):
        return 0.0
    try:
        return float(t.replace(",", ""))
    except ValueError:
        return 0.0


def _default_fee_frequency(db: Session) -> str:
    row = (
        db.query(models.SchoolFeeFrequency)
        .order_by(models.SchoolFeeFrequency.sort_order, models.SchoolFeeFrequency.name)
        .first()
    )
    return row.name if row else "annual"


def _all_fee_heads_ordered(db: Session) -> list[models.SchoolFeeHead]:
    """All fee heads — same set as `/fee-heads` and the fee structure matrix columns."""
    ensure_fee_particular_rows(db)
    return (
        db.query(models.SchoolFeeHead)
        .order_by(models.SchoolFeeHead.sort_order, models.SchoolFeeHead.name)
        .all()
    )


def _fee_particular_storage_key(head: models.SchoolFeeHead) -> str:
    """Stable API row id: canonical particular_key, or synthetic `__fh{id}__` for custom heads."""
    pk = (head.particular_key or "").strip()
    if pk:
        return pk
    return f"__fh{head.id}__"


def _head_from_fee_particular_row_key(
    db: Session, row_key: str
) -> models.SchoolFeeHead | None:
    key = (row_key or "").strip()
    if not key:
        return None
    m = re.match(r"^__fh(\d+)__$", key)
    if m:
        return db.get(models.SchoolFeeHead, int(m.group(1)))
    return (
        db.query(models.SchoolFeeHead)
        .filter(models.SchoolFeeHead.particular_key == key)
        .first()
    )


def _fee_particular_readonly(head: models.SchoolFeeHead) -> bool:
    if head.is_locked:
        return True
    return (head.prefix_amount or "").strip().upper() == "FIXED"


def _fee_structure_cell(
    db: Session, class_name: str, fee_head: str, academic_year: str
) -> models.FeeStructureItem | None:
    return (
        db.query(models.FeeStructureItem)
        .filter(
            models.FeeStructureItem.class_name == class_name,
            models.FeeStructureItem.fee_head == fee_head,
            models.FeeStructureItem.academic_year == academic_year,
        )
        .first()
    )


def _build_fee_sheet_class(
    db: Session, class_name: str, academic_year: str
) -> schemas.FeeParticularSheetRead:
    cn = class_name.strip()
    rows_out: list[schemas.FeeParticularRowRead] = []
    for head in _all_fee_heads_ordered(db):
        pkey = _fee_particular_storage_key(head)
        ro = _fee_particular_readonly(head)
        if ro:
            amt = (head.prefix_amount or "").strip() or "FIXED"
            src = "template"
        else:
            cell = _fee_structure_cell(db, cn, head.name, academic_year)
            if cell:
                amt = _fmt_amount(float(cell.amount))
                src = "class_structure"
            else:
                amt = (head.prefix_amount or "0").strip()
                src = "template"
        rows_out.append(
            schemas.FeeParticularRowRead(
                fee_head_id=head.id,
                particular_key=pkey,
                label=head.name,
                amount_text=amt,
                is_locked=head.is_locked,
                readonly_amount=ro,
                source=src,
            )
        )
    return schemas.FeeParticularSheetRead(
        scope="class",
        class_name=cn,
        student_id=None,
        student_name=None,
        admission_no=None,
        academic_year=academic_year,
        rows=rows_out,
    )


def _build_fee_sheet_student(
    db: Session, student_id: int, academic_year: str
) -> schemas.FeeParticularSheetRead:
    st = db.get(models.Student, student_id)
    if not st:
        raise HTTPException(status_code=404, detail="Student not found")
    cn = st.class_name.strip()
    rows_out: list[schemas.FeeParticularRowRead] = []
    for head in _all_fee_heads_ordered(db):
        pkey = _fee_particular_storage_key(head)
        ro = _fee_particular_readonly(head)
        if ro:
            amt = (head.prefix_amount or "").strip() or "FIXED"
            src = "template"
        else:
            ov = (
                db.query(models.StudentFeeParticular)
                .filter(
                    models.StudentFeeParticular.student_id == student_id,
                    models.StudentFeeParticular.particular_key == pkey,
                    models.StudentFeeParticular.academic_year == academic_year,
                )
                .first()
            )
            if ov:
                amt = (ov.amount_text or "0").strip()
                src = "student_override"
            else:
                cell = _fee_structure_cell(db, cn, head.name, academic_year)
                if cell:
                    amt = _fmt_amount(float(cell.amount))
                    src = "class_structure"
                else:
                    amt = (head.prefix_amount or "0").strip()
                    src = "template"
        rows_out.append(
            schemas.FeeParticularRowRead(
                fee_head_id=head.id,
                particular_key=pkey,
                label=head.name,
                amount_text=amt,
                is_locked=head.is_locked,
                readonly_amount=ro,
                source=src,
            )
        )
    return schemas.FeeParticularSheetRead(
        scope="student",
        class_name=cn,
        student_id=st.id,
        student_name=st.full_name,
        admission_no=st.admission_no,
        academic_year=academic_year,
        rows=rows_out,
    )


@router.get("/fee-particulars-sheet", response_model=schemas.FeeParticularSheetRead)
def get_fee_particulars_sheet(
    scope: Literal["class", "student"] = Query(..., description="class or student"),
    class_name: str | None = Query(None),
    student_id: int | None = Query(None),
    academic_year: str | None = Query(None),
    db: Session = Depends(get_db),
):
    ay = (academic_year or "").strip() or academic_year_for_date(date.today())
    if scope == "class":
        cn = (class_name or "").strip()
        if not cn:
            raise HTTPException(
                status_code=400, detail="class_name is required for class scope"
            )
        return _build_fee_sheet_class(db, cn, ay)
    sid = student_id
    if sid is None or sid <= 0:
        raise HTTPException(
            status_code=400, detail="student_id is required for student scope"
        )
    return _build_fee_sheet_student(db, sid, ay)


@router.put("/fee-particulars-sheet", response_model=schemas.FeeParticularSheetRead)
def put_fee_particulars_sheet(
    body: schemas.FeeParticularSheetWrite, db: Session = Depends(get_db)
):
    ay = (body.academic_year or "").strip() or academic_year_for_date(date.today())

    if body.scope == "class":
        cn = (body.class_name or "").strip()
        if not cn:
            raise HTTPException(
                status_code=400, detail="class_name is required for class scope"
            )
        freq = _default_fee_frequency(db)
        for row in body.rows:
            head = _head_from_fee_particular_row_key(db, row.particular_key)
            if not head or _fee_particular_readonly(head):
                continue
            amount_f = _parse_amount_for_structure(row.amount_text)
            cell = _fee_structure_cell(db, cn, head.name, ay)
            if cell:
                cell.amount = amount_f
            else:
                db.add(
                    models.FeeStructureItem(
                        class_name=cn,
                        fee_head=head.name,
                        amount=amount_f,
                        frequency=freq,
                        academic_year=ay,
                    )
                )
        db.commit()
        return _build_fee_sheet_class(db, cn, ay)

    sid = body.student_id
    if sid is None or sid <= 0:
        raise HTTPException(
            status_code=400, detail="student_id is required for student scope"
        )
    st = db.get(models.Student, sid)
    if not st:
        raise HTTPException(status_code=404, detail="Student not found")
    for row in body.rows:
        head = _head_from_fee_particular_row_key(db, row.particular_key)
        if not head or _fee_particular_readonly(head):
            continue
        at = (row.amount_text or "0").strip()[:40]
        sk = _fee_particular_storage_key(head)
        spo = (
            db.query(models.StudentFeeParticular)
            .filter(
                models.StudentFeeParticular.student_id == sid,
                models.StudentFeeParticular.particular_key == sk,
                models.StudentFeeParticular.academic_year == ay,
            )
            .first()
        )
        if spo:
            spo.amount_text = at
        else:
            db.add(
                models.StudentFeeParticular(
                    student_id=sid,
                    particular_key=sk,
                    amount_text=at,
                    academic_year=ay,
                )
            )
    db.commit()
    return _build_fee_sheet_student(db, sid, ay)


@router.get("/fee-structure", response_model=list[schemas.FeeStructureRead])
def list_fee_structure(
    academic_year: str | None = Query(None),
    db: Session = Depends(get_db),
):
    ay = (academic_year or "").strip() or academic_year_for_date(date.today())
    return (
        db.query(models.FeeStructureItem)
        .filter(models.FeeStructureItem.academic_year == ay)
        .order_by(models.FeeStructureItem.class_name, models.FeeStructureItem.fee_head)
        .all()
    )


@router.put("/fee-structure", response_model=list[schemas.FeeStructureRead])
def put_fee_structure_matrix(
    body: schemas.FeeStructureBulkUpsert, db: Session = Depends(get_db)
):
    ay = (body.academic_year or "").strip()
    if not ay:
        raise HTTPException(status_code=400, detail="academic_year is required")
    freq_fallback = (body.frequency or "").strip() or _default_fee_frequency(db)
    for cell in body.cells:
        cn = cell.class_name.strip()
        fh = cell.fee_head.strip()
        if not cn or not fh:
            continue
        freq = (cell.frequency or "").strip() or freq_fallback
        amount = float(cell.amount)
        existing = (
            db.query(models.FeeStructureItem)
            .filter(
                models.FeeStructureItem.class_name == cn,
                models.FeeStructureItem.fee_head == fh,
                models.FeeStructureItem.academic_year == ay,
            )
            .first()
        )
        if existing:
            existing.amount = amount
            existing.frequency = freq
        else:
            db.add(
                models.FeeStructureItem(
                    class_name=cn,
                    fee_head=fh,
                    amount=amount,
                    frequency=freq,
                    academic_year=ay,
                )
            )
    db.commit()
    return list_fee_structure(academic_year=ay, db=db)
