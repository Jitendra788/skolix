from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/ptm", tags=["ptm"])


@router.get("", response_model=list[schemas.PTMUpdateRead])
def list_ptm(
    class_name: str | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(models.PTMUpdate)
    if class_name:
        q = q.filter(models.PTMUpdate.class_name == class_name)
    return q.order_by(models.PTMUpdate.scheduled_at.desc()).offset(skip).limit(limit).all()


@router.post("", response_model=schemas.PTMUpdateRead)
def create_ptm(item: schemas.PTMUpdateCreate, db: Session = Depends(get_db)):
    row = models.PTMUpdate(**item.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/{ptm_id}", response_model=schemas.PTMUpdateRead)
def update_ptm(
    ptm_id: int, item: schemas.PTMUpdateCreate, db: Session = Depends(get_db)
):
    row = db.get(models.PTMUpdate, ptm_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in item.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{ptm_id}")
def delete_ptm(ptm_id: int, db: Session = Depends(get_db)):
    row = db.get(models.PTMUpdate, ptm_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
