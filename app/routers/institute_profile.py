from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/institute-profile", tags=["institute-profile"])

SINGLETON_ID = 1


def _get_or_create_row(db: Session) -> models.InstituteProfile:
    row = db.get(models.InstituteProfile, SINGLETON_ID)
    if row:
        return row
    row = models.InstituteProfile(id=SINGLETON_ID)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("", response_model=schemas.InstituteProfileRead)
def get_profile(db: Session = Depends(get_db)):
    return _get_or_create_row(db)


@router.put("", response_model=schemas.InstituteProfileRead)
def update_profile(
    item: schemas.InstituteProfileUpdate, db: Session = Depends(get_db)
):
    row = _get_or_create_row(db)
    data = item.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    for k, v in data.items():
        setattr(row, k, v if v is not None else "")
    db.commit()
    db.refresh(row)
    return row
