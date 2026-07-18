from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from .auth_context import faculty_from_teacher_token, parse_bearer_payload

router = APIRouter(prefix="/homeworks", tags=["homeworks"])


@router.get("", response_model=list[schemas.HomeworkRead])
def list_homeworks(
    date_filter: date | None = Query(default=None, alias="date"),
    class_filter: str | None = Query(default=None, alias="class"),
    teacher: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    payload = parse_bearer_payload(authorization)
    fac = faculty_from_teacher_token(payload, db)
    q = db.query(models.Homework)
    if date_filter is not None:
        q = q.filter(models.Homework.date == date_filter)
    if class_filter and class_filter.strip():
        q = q.filter(models.Homework.class_name == class_filter.strip())
    if fac:
        name = (fac.name or "").strip()
        if not name:
            return []
        q = q.filter(models.Homework.teacher_name == name)
    elif teacher and teacher.strip():
        q = q.filter(models.Homework.teacher_name == teacher.strip())
    return q.order_by(models.Homework.date.desc(), models.Homework.created_at.desc()).all()


@router.post("", response_model=schemas.HomeworkRead)
def create_homework(
    item: schemas.HomeworkCreate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    payload = parse_bearer_payload(authorization)
    fac = faculty_from_teacher_token(payload, db)
    data = item.model_dump()
    if fac:
        name = (fac.name or "").strip()
        if not name:
            raise HTTPException(status_code=403, detail="Teacher profile has no name")
        data["teacher_name"] = name
    row = models.Homework(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/{homework_id}", response_model=schemas.HomeworkRead)
def update_homework(
    homework_id: int,
    item: schemas.HomeworkCreate,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    row = db.get(models.Homework, homework_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    payload = parse_bearer_payload(authorization)
    fac = faculty_from_teacher_token(payload, db)
    if fac:
        name = (fac.name or "").strip()
        if (row.teacher_name or "").strip() != name:
            raise HTTPException(status_code=403, detail="Not allowed to edit this homework")
        data = item.model_dump()
        data["teacher_name"] = name
        for k, v in data.items():
            setattr(row, k, v)
    else:
        for k, v in item.model_dump().items():
            setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{homework_id}")
def delete_homework(
    homework_id: int,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    row = db.get(models.Homework, homework_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    payload = parse_bearer_payload(authorization)
    fac = faculty_from_teacher_token(payload, db)
    if fac:
        name = (fac.name or "").strip()
        if (row.teacher_name or "").strip() != name:
            raise HTTPException(status_code=403, detail="Not allowed to delete this homework")
    db.delete(row)
    db.commit()
    return {"ok": True}
