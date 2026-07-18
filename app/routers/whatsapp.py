import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..services import whatsapp_cloud
from ..services.sms_gateway import send_sms

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])

# Integrate Meta WhatsApp Cloud API or Twilio here; this stores and simulates send.


def _institute_contact(db: Session) -> tuple[str, str]:
    row = db.get(models.InstituteProfile, 1)
    if not row:
        return "", ""
    return ((row.name or "").strip(), (row.phone or "").strip())


def _apply_school_placeholders(text: str, db: Session) -> str:
    """Replace {school_name} / {school_phone} from Institute Profile (safe: no str.format)."""
    name, phone = _institute_contact(db)
    return (
        text.replace("{school_name}", name or "School")
        .replace("{school_phone}", phone or "—")
    )


def _wa_row_status(parent_phone: str, message: str, simulated: str) -> str:
    if not (parent_phone or "").strip():
        return simulated
    if not whatsapp_cloud.is_configured():
        return simulated
    r = whatsapp_cloud.send_whatsapp_message(message, parent_phone)
    if r.status == "sent":
        return "sent_whatsapp"
    return f"failed_whatsapp:{r.status}"


def _apply_sender_signature(text: str) -> str:
    sender_name = "Jitendra Jangir"
    body = (text or "").strip().replace("{sender_name}", sender_name)
    if not body:
        return body
    if sender_name.lower() in body.lower():
        return body
    return f"{body}\n- {sender_name}"


@router.get("/broadcasts", response_model=list[schemas.WhatsAppBroadcastRead])
def list_broadcasts(
    class_name: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(models.WhatsAppBroadcast)
    if class_name:
        q = q.filter(models.WhatsAppBroadcast.class_name == class_name)
    return q.order_by(models.WhatsAppBroadcast.created_at.desc()).offset(skip).limit(limit).all()


@router.post("/broadcasts", response_model=schemas.WhatsAppBroadcastRead)
def queue_broadcast(
    item: schemas.WhatsAppBroadcastCreate, db: Session = Depends(get_db)
):
    body = _apply_school_placeholders((item.message or "").strip(), db)
    body = _apply_sender_signature(body)
    default_status = item.status.strip() if item.status else "sent_simulated"
    phone = item.parent_phone.strip()
    status = (
        _wa_row_status(phone, body, default_status)
        if phone
        else default_status
    )
    row = models.WhatsAppBroadcast(
        class_name=item.class_name,
        message=body,
        status=status,
        sent_at=datetime.utcnow(),
        admission_no=item.admission_no.strip(),
        parent_phone=phone,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/broadcasts/group", response_model=schemas.WhatsAppGroupSendResult)
def queue_group_broadcast(
    item: schemas.WhatsAppBroadcastCreate, db: Session = Depends(get_db)
):
    class_name = (item.class_name or "").strip()
    message = (item.message or "").strip()
    if not class_name:
        raise HTTPException(status_code=400, detail="class_name is required")
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    message = _apply_school_placeholders(message, db)
    message = _apply_sender_signature(message)
    simulated = item.status.strip() if item.status else "sent_simulated"
    students = (
        db.query(models.Student)
        .filter(models.Student.class_name == class_name)
        .order_by(models.Student.id.asc())
        .all()
    )
    if not students:
        raise HTTPException(status_code=404, detail="No students found for this class")

    queued_count = 0
    skipped_count = 0
    failed_count = 0
    for s in students:
        parent_phone = (s.parent_phone or "").strip()
        if not parent_phone:
            skipped_count += 1
            continue
        row_status = _wa_row_status(parent_phone, message, simulated)
        if row_status.startswith("failed_whatsapp"):
            failed_count += 1
        row = models.WhatsAppBroadcast(
            class_name=class_name,
            message=message,
            status=row_status,
            sent_at=datetime.utcnow(),
            admission_no=(s.admission_no or "").strip(),
            parent_phone=parent_phone,
        )
        db.add(row)
        queued_count += 1

    if not whatsapp_cloud.is_configured() or queued_count == 0:
        summary_status = simulated
    elif failed_count == 0:
        summary_status = "sent_whatsapp"
    elif failed_count == queued_count:
        summary_status = "failed_whatsapp"
    else:
        summary_status = "partial_failed"

    db.commit()
    return schemas.WhatsAppGroupSendResult(
        class_name=class_name,
        message=message,
        status=summary_status,
        queued_count=queued_count,
        skipped_count=skipped_count,
        failed_count=failed_count,
    )


@router.post("/broadcasts/due-fees", response_model=schemas.WhatsAppDueFeesSendResult)
def queue_due_fees_broadcast(
    item: schemas.WhatsAppDueFeesSendCreate, db: Session = Depends(get_db)
):
    class_name = (item.class_name or "").strip()
    academic_year = (item.academic_year or "").strip()
    if not class_name:
        raise HTTPException(status_code=400, detail="class_name is required")
    if not academic_year:
        raise HTTPException(status_code=400, detail="academic_year is required")

    status = "sent_simulated"
    students = (
        db.query(models.Student)
        .filter(models.Student.class_name == class_name)
        .all()
    )
    by_adm = {(s.admission_no or "").strip(): s for s in students}
    fee_rows = (
        db.query(models.StudentFee)
        .filter(
            models.StudentFee.class_name == class_name,
            models.StudentFee.academic_year == academic_year,
            models.StudentFee.total_due > 0,
        )
        .order_by(models.StudentFee.student_name.asc())
        .all()
    )
    if not fee_rows:
        raise HTTPException(
            status_code=404,
            detail="No due fee records found for this class and academic year",
        )

    tpl = (item.message_template or "").strip()
    school_name, school_phone = _institute_contact(db)
    if not tpl:
        tpl = (
            "Dear Parent, fee due for {student_name} ({admission_no}) in {class_name} "
            "for {academic_year} is Rs {due_amount}. "
            "For fee payment / queries contact {school_name} at {school_phone}. Thank you.\n"
            "- {sender_name}"
        )

    queued_count = 0
    skipped_count = 0
    failed_count = 0
    total_due_sum = 0.0
    for fee in fee_rows:
        due = float(fee.total_due or 0)
        if due <= 0:
            continue
        adm = (fee.admission_no or "").strip()
        st = by_adm.get(adm)
        parent_phone = ((st.parent_phone if st else "") or "").strip()
        if not parent_phone:
            skipped_count += 1
            continue
        msg = tpl.format(
            student_name=(fee.student_name or "").strip(),
            admission_no=adm,
            class_name=class_name,
            academic_year=academic_year,
            due_amount=f"{due:.2f}",
            school_name=school_name or "School",
            school_phone=school_phone or "—",
            sender_name="Jitendra Jangir",
        )
        msg = _apply_sender_signature(msg)
        row_status = _wa_row_status(parent_phone, msg, status)
        if row_status.startswith("failed_whatsapp"):
            failed_count += 1
        row = models.WhatsAppBroadcast(
            class_name=class_name,
            message=msg,
            status=row_status,
            sent_at=datetime.utcnow(),
            admission_no=adm,
            parent_phone=parent_phone,
        )
        db.add(row)
        queued_count += 1
        total_due_sum += due

    if not whatsapp_cloud.is_configured() or queued_count == 0:
        summary_status = status
    elif failed_count == 0:
        summary_status = "sent_whatsapp"
    elif failed_count == queued_count:
        summary_status = "failed_whatsapp"
    else:
        summary_status = "partial_failed"

    db.commit()
    return schemas.WhatsAppDueFeesSendResult(
        class_name=class_name,
        academic_year=academic_year,
        status=summary_status,
        queued_count=queued_count,
        skipped_count=skipped_count,
        failed_count=failed_count,
        total_due_sum=round(total_due_sum, 2),
    )


@router.post("/sms/send", response_model=schemas.SmsSendResult)
def queue_sms_send(
    item: schemas.SmsSendCreate, db: Session = Depends(get_db)
):
    phone_number = (item.phone_number or "").strip()
    message = (item.message or "").strip()
    if not phone_number:
        raise HTTPException(status_code=400, detail="phone_number is required")
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    message = _apply_school_placeholders(message, db)
    message = _apply_sender_signature(message)
    send_result = send_sms(phone_number, message)
    status = item.status.strip() if item.status else send_result.status
    row = models.WhatsAppBroadcast(
        class_name="SMS",
        message=message,
        status=status,
        sent_at=datetime.utcnow(),
        admission_no="",
        parent_phone=phone_number,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return schemas.SmsSendResult(
        id=row.id,
        phone_number=phone_number,
        message=message,
        status=row.status,
        sent_at=row.sent_at,
    )


@router.delete("/broadcasts/{broadcast_id}")
def delete_broadcast(broadcast_id: int, db: Session = Depends(get_db)):
    row = db.get(models.WhatsAppBroadcast, broadcast_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/config")
def get_whatsapp_config():
    cfg = whatsapp_cloud.is_configured()
    tpl = bool((os.getenv("WHATSAPP_TEMPLATE_NAME") or "").strip())
    return {
        "mode": "whatsapp_cloud" if cfg else "stub",
        "cloud_configured": cfg,
        "template_mode": tpl,
        "api_version": (os.getenv("WHATSAPP_API_VERSION") or "v21.0").strip(),
        "hint": (
            "Meta: use Phone number ID (numeric from WhatsApp > API setup), not the display number 8302095185. "
            "For new chats use an approved WHATSAPP_TEMPLATE_NAME + WHATSAPP_TEMPLATE_LANGUAGE (e.g. en_US)."
        ),
        "sms_provider": "Set SMS_PROVIDER for Text SMS tab",
    }
