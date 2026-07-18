from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/gallery", tags=["gallery"])


@router.get("", response_model=list[schemas.GalleryImageRead])
def list_gallery(skip: int = 0, limit: int = 200, db: Session = Depends(get_db)):
    return (
        db.query(models.GalleryImage)
        .order_by(models.GalleryImage.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.post("", response_model=schemas.GalleryImageRead)
def add_image(item: schemas.GalleryImageCreate, db: Session = Depends(get_db)):
    row = models.GalleryImage(**item.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/{image_id}", response_model=schemas.GalleryImageRead)
def update_image(
    image_id: int, item: schemas.GalleryImageCreate, db: Session = Depends(get_db)
):
    row = db.get(models.GalleryImage, image_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in item.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{image_id}")
def delete_image(image_id: int, db: Session = Depends(get_db)):
    row = db.get(models.GalleryImage, image_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
