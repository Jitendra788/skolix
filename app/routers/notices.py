from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/notices", tags=["notices"])


@router.get("", response_model=list[schemas.NoticeRead])
def list_notices(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return (
        db.query(models.Notice)
        .order_by(models.Notice.pinned.desc(), models.Notice.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.post("", response_model=schemas.NoticeRead)
def create_notice(item: schemas.NoticeCreate, db: Session = Depends(get_db)):
    row = models.Notice(**item.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/{notice_id}", response_model=schemas.NoticeRead)
def update_notice(
    notice_id: int, item: schemas.NoticeCreate, db: Session = Depends(get_db)
):
    row = db.get(models.Notice, notice_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in item.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{notice_id}")
def delete_notice(notice_id: int, db: Session = Depends(get_db)):
    row = db.get(models.Notice, notice_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
