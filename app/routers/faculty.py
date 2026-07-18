from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/faculty", tags=["faculty"])


@router.get("", response_model=list[schemas.FacultyRead])
def list_faculty(skip: int = 0, limit: int = 200, db: Session = Depends(get_db)):
    return db.query(models.Faculty).offset(skip).limit(limit).all()


@router.post("", response_model=schemas.FacultyRead)
def create_faculty(item: schemas.FacultyCreate, db: Session = Depends(get_db)):
    row = models.Faculty(**item.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/{faculty_id}", response_model=schemas.FacultyRead)
def get_faculty(faculty_id: int, db: Session = Depends(get_db)):
    row = db.get(models.Faculty, faculty_id)
    if not row:
        raise HTTPException(status_code=404, detail="Faculty not found")
    return row


@router.put("/{faculty_id}", response_model=schemas.FacultyRead)
def update_faculty(
    faculty_id: int, item: schemas.FacultyCreate, db: Session = Depends(get_db)
):
    row = db.get(models.Faculty, faculty_id)
    if not row:
        raise HTTPException(status_code=404, detail="Faculty not found")
    for k, v in item.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{faculty_id}")
def delete_faculty(faculty_id: int, db: Session = Depends(get_db)):
    row = db.get(models.Faculty, faculty_id)
    if not row:
        raise HTTPException(status_code=404, detail="Faculty not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
