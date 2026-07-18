"""Student fee ledger: apply class fee structure, concessions (policy-aware), payments."""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/fees", tags=["fees"])


def _institute_discount_policy(db: Session) -> str:
    row = db.get(models.InstituteProfile, 1)
    if not row:
        return "percentage"
    raw = (getattr(row, "discount_type", None) or "percentage").strip().lower()
    if raw not in {"percentage", "fixed_amount", "none"}:
        return "percentage"
    return raw


def _assert_discount_policy(
    policy: str,
    *,
    new_discount_total: float,
    gross: float,
    total_paid: float,
) -> None:
    if policy == "none" and new_discount_total > 1e-6:
        raise HTTPException(
            status_code=400,
            detail="Concessions are disabled for this institute (discount type: none).",
        )
    max_disc = max(0.0, float(gross) - float(total_paid))
    if new_discount_total > max_disc + 1e-4:
        raise HTTPException(
            status_code=400,
            detail="Discount cannot exceed gross fee minus amounts already collected.",
        )


def _sum_fee_structure_gross(db: Session, class_name: str, academic_year: str) -> float:
    rows = (
        db.query(models.FeeStructureItem)
        .filter(
            models.FeeStructureItem.class_name == class_name,
            models.FeeStructureItem.academic_year == academic_year,
        )
        .all()
    )
    return round(sum(float(r.amount) for r in rows), 2)


def _student_effective_fee_gross(db: Session, st: models.Student, academic_year: str) -> float:
    """Sum of fee head amounts for this student and year (same rules as fee-particulars sheet)."""
    from ..routers.school_reference import (
        _all_fee_heads_ordered,
        _fee_particular_readonly,
        _fee_particular_storage_key,
        _fee_structure_cell,
        _fmt_amount,
        _parse_amount_for_structure,
        ensure_fee_particular_rows,
    )

    ensure_fee_particular_rows(db)
    ay = (academic_year or "").strip()
    cn = (st.class_name or "").strip()
    total = 0.0
    for head in _all_fee_heads_ordered(db):
        pkey = _fee_particular_storage_key(head)
        if _fee_particular_readonly(head):
            amt = (head.prefix_amount or "").strip() or "FIXED"
        else:
            ov = (
                db.query(models.StudentFeeParticular)
                .filter(
                    models.StudentFeeParticular.student_id == st.id,
                    models.StudentFeeParticular.particular_key == pkey,
                    models.StudentFeeParticular.academic_year == ay,
                )
                .first()
            )
            if ov:
                amt = (ov.amount_text or "0").strip()
            else:
                cell = _fee_structure_cell(db, cn, head.name, ay)
                if cell:
                    amt = _fmt_amount(float(cell.amount))
                else:
                    amt = (head.prefix_amount or "0").strip()
        total += _parse_amount_for_structure(amt)
    return round(total, 2)


def _sync_total_due_and_installments(sf: models.StudentFee) -> None:
    gross = float(sf.gross_total or 0)
    disc = float(sf.discount_amount or 0)
    paid = float(sf.total_paid or 0)
    sf.total_due = round(max(0.0, gross - disc - paid), 2)
    insts = list(sf.installments or [])
    if len(insts) == 1:
        ins = insts[0]
        net = max(0.0, gross - disc)
        ins.amount = round(net, 2)
        ins.amount_paid = round(min(paid, net), 2)


def _student_fee_read(db: Session, sf: models.StudentFee) -> schemas.StudentFeeRead:
    st = (
        db.query(models.Student)
        .filter(models.Student.admission_no == sf.admission_no)
        .first()
    )
    section = (st.section or "") if st else ""
    base = schemas.StudentFeeRead.model_validate(sf)
    return base.model_copy(update={"section": section})


@router.get("/student-fees", response_model=list[schemas.StudentFeeRead])
def list_student_fees(
    class_name: str,
    academic_year: str,
    db: Session = Depends(get_db),
):
    cn = class_name.strip()
    ay = academic_year.strip()
    if not cn or not ay:
        raise HTTPException(status_code=400, detail="class_name and academic_year are required.")
    rows = (
        db.query(models.StudentFee)
        .options(joinedload(models.StudentFee.installments))
        .filter(
            models.StudentFee.class_name == cn,
            models.StudentFee.academic_year == ay,
        )
        .order_by(models.StudentFee.student_name)
        .all()
    )
    return [_student_fee_read(db, r) for r in rows]


@router.post(
    "/apply-structure-to-class",
    response_model=schemas.FeeApplyStructureToClassResult,
)
def apply_fee_structure_to_class(
    body: schemas.FeeApplyStructureToClassBody,
    db: Session = Depends(get_db),
):
    cn = body.class_name.strip()
    ay = body.academic_year.strip()
    if not cn or not ay:
        raise HTTPException(status_code=400, detail="class_name and academic_year are required.")

    due = body.consolidated_due_date or date.today()
    students = (
        db.query(models.Student)
        .filter(models.Student.class_name == cn)
        .order_by(models.Student.full_name)
        .all()
    )
    if not students:
        raise HTTPException(
            status_code=400,
            detail="No students found in this class.",
        )

    class_template_gross = _sum_fee_structure_gross(db, cn, ay)
    effective_by_adm = {
        st.admission_no: _student_effective_fee_gross(db, st, ay) for st in students
    }
    if not any(v > 1e-6 for v in effective_by_adm.values()):
        raise HTTPException(
            status_code=400,
            detail=(
                "No fee amounts found. Save the fee structure and/or fee particulars "
                "for this class and academic year."
            ),
        )

    created = skipped = replaced = skipped_paid = 0
    for st in students:
        existing = (
            db.query(models.StudentFee)
            .options(joinedload(models.StudentFee.installments))
            .filter(
                models.StudentFee.admission_no == st.admission_no,
                models.StudentFee.academic_year == ay,
            )
            .first()
        )
        replaced_this = False
        if existing:
            if not body.replace_existing:
                skipped += 1
                continue
            if float(existing.total_paid or 0) > 1e-6:
                skipped_paid += 1
                continue
            db.delete(existing)
            db.flush()
            replaced_this = True

        student_gross = effective_by_adm[st.admission_no]
        sf = models.StudentFee(
            student_name=st.full_name,
            admission_no=st.admission_no,
            class_name=st.class_name,
            academic_year=ay,
            fee_plan_id=None,
            gross_total=student_gross,
            discount_amount=0.0,
            total_due=student_gross,
            total_paid=0.0,
            last_payment_date=None,
            remarks="",
            recorded_at=datetime.utcnow(),
        )
        db.add(sf)
        db.flush()
        db.add(
            models.FeeInstallment(
                student_fee_id=sf.id,
                sequence_no=1,
                label="Consolidated (from fee structure)",
                due_date=due,
                amount=student_gross,
                amount_paid=0.0,
            )
        )
        if replaced_this:
            replaced += 1
        else:
            created += 1

    db.commit()
    avg_effective = (
        round(sum(effective_by_adm.values()) / len(effective_by_adm), 2)
        if effective_by_adm
        else 0.0
    )
    report_gross = (
        class_template_gross if class_template_gross > 1e-6 else avg_effective
    )
    return schemas.FeeApplyStructureToClassResult(
        class_name=cn,
        academic_year=ay,
        per_student_gross=report_gross,
        created=created,
        skipped=skipped,
        replaced=replaced,
        skipped_with_payments=skipped_paid,
    )


@router.put(
    "/student-fees/{student_fee_id}/concession",
    response_model=schemas.StudentFeeRead,
)
def update_student_fee_concession(
    student_fee_id: int,
    body: schemas.FeeConcessionUpdate,
    db: Session = Depends(get_db),
):
    sf = (
        db.query(models.StudentFee)
        .options(joinedload(models.StudentFee.installments))
        .filter(models.StudentFee.id == student_fee_id)
        .first()
    )
    if not sf:
        raise HTTPException(status_code=404, detail="Student fee record not found.")

    policy = _institute_discount_policy(db)
    gross = float(sf.gross_total or 0)
    paid = float(sf.total_paid or 0)
    before = float(sf.discount_amount or 0)
    after = float(body.discount_amount)

    _assert_discount_policy(policy, new_discount_total=after, gross=gross, total_paid=paid)

    if abs(after - before) < 1e-6:
        _sync_total_due_and_installments(sf)
        db.commit()
        db.refresh(sf)
        return _student_fee_read(db, sf)

    sf.discount_amount = round(after, 2)
    _sync_total_due_and_installments(sf)
    db.add(
        models.FeeConcessionLog(
            student_fee_id=sf.id,
            concession_before=before,
            concession_after=after,
            source="admin",
            notes=(body.note or "")[:500],
            allocation_json="[]",
        )
    )
    db.commit()
    db.refresh(sf)
    return _student_fee_read(db, sf)


@router.post(
    "/student-fees/{student_fee_id}/payment",
    response_model=schemas.FeeApplyPaymentResult,
)
def apply_student_fee_payment(
    student_fee_id: int,
    body: schemas.FeeApplyPaymentBody,
    db: Session = Depends(get_db),
):
    sf = (
        db.query(models.StudentFee)
        .options(joinedload(models.StudentFee.installments))
        .filter(models.StudentFee.id == student_fee_id)
        .first()
    )
    if not sf:
        raise HTTPException(status_code=404, detail="Student fee record not found.")

    policy = _institute_discount_policy(db)
    gross = float(sf.gross_total or 0)
    disc = float(sf.discount_amount or 0)
    paid = float(sf.total_paid or 0)

    balance = round(max(0.0, gross - disc - paid), 2)
    applied_disc = min(float(body.additional_concession or 0), balance)
    new_disc = disc + applied_disc
    _assert_discount_policy(
        policy,
        new_discount_total=new_disc,
        gross=gross,
        total_paid=paid,
    )

    balance = round(max(0.0, gross - new_disc - paid), 2)
    pay_requested = float(body.amount or 0)
    applied_pay = min(pay_requested, balance)
    new_paid = paid + applied_pay

    sf.discount_amount = round(new_disc, 2)
    sf.total_paid = round(new_paid, 2)
    if applied_pay > 1e-6:
        sf.last_payment_date = body.paid_on or date.today()

    _sync_total_due_and_installments(sf)

    if applied_disc > 1e-6:
        db.add(
            models.FeeConcessionLog(
                student_fee_id=sf.id,
                concession_before=disc,
                concession_after=new_disc,
                source="payment",
                notes=(body.note or "")[:500],
                allocation_json="[]",
            )
        )
    if applied_pay > 1e-6:
        db.add(
            models.FeePaymentLog(
                student_fee_id=sf.id,
                amount=round(applied_pay, 2),
                paid_at=datetime.utcnow(),
                source="cash",
                allocation_json="[]",
                notes=(body.note or "")[:500],
            )
        )

    db.commit()
    db.refresh(sf)
    add_con = float(body.additional_concession or 0)
    amount_unapplied = round(
        max(0.0, pay_requested - applied_pay) + max(0.0, add_con - applied_disc),
        2,
    )

    return schemas.FeeApplyPaymentResult(
        student_fee=_student_fee_read(db, sf),
        amount_applied=round(applied_pay, 2),
        amount_unapplied=amount_unapplied,
    )
