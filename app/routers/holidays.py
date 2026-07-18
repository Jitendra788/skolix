from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/holidays", tags=["holidays"])


def _api_weekday_matches(d: date, api_weekday: int) -> bool:
    """API weekday 0=Sunday … 6=Saturday → Python weekday() Mon=0 … Sun=6."""
    py_wd = (api_weekday + 6) % 7
    return d.weekday() == py_wd


@router.get("", response_model=list[schemas.SchoolHolidayRead])
def list_holidays(
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.SchoolHoliday)
    if date_from:
        q = q.filter(models.SchoolHoliday.holiday_date >= date_from)
    if date_to:
        q = q.filter(models.SchoolHoliday.holiday_date <= date_to)
    return q.order_by(models.SchoolHoliday.holiday_date).all()


@router.get("/in-month", response_model=list[schemas.SchoolHolidayRead])
def list_holidays_in_month(
    year_month: str = Query(..., description="YYYY-MM"),
    db: Session = Depends(get_db),
):
    if len(year_month) < 7:
        raise HTTPException(status_code=400, detail="Use YYYY-MM")
    try:
        y = int(year_month[:4])
        m = int(year_month[5:7])
        from calendar import monthrange

        first = date(y, m, 1)
        last = date(y, m, monthrange(y, m)[1])
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid year_month")
    return (
        db.query(models.SchoolHoliday)
        .filter(
            models.SchoolHoliday.holiday_date >= first,
            models.SchoolHoliday.holiday_date <= last,
        )
        .order_by(models.SchoolHoliday.holiday_date)
        .all()
    )


@router.post("", response_model=schemas.SchoolHolidayRead)
def create_holiday(item: schemas.SchoolHolidayCreate, db: Session = Depends(get_db)):
    row = models.SchoolHoliday(**item.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/generate-weekly", response_model=list[schemas.SchoolHolidayRead])
def generate_weekly_holidays(
    item: schemas.SchoolHolidayRecurringCreate, db: Session = Depends(get_db)
):
    if item.date_to < item.date_from:
        raise HTTPException(status_code=400, detail="date_to must be on or after date_from")
    created: list[models.SchoolHoliday] = []
    d = item.date_from
    while d <= item.date_to:
        if _api_weekday_matches(d, item.weekday):
            if item.skip_if_date_has_holiday:
                exists = (
                    db.query(models.SchoolHoliday)
                    .filter(models.SchoolHoliday.holiday_date == d)
                    .first()
                )
                if exists:
                    d += timedelta(days=1)
                    continue
            row = models.SchoolHoliday(
                holiday_date=d,
                name=item.name.strip() or "Holiday",
                notes=(item.notes or "").strip(),
            )
            db.add(row)
            created.append(row)
        d += timedelta(days=1)
    db.commit()
    for r in created:
        db.refresh(r)
    return created


@router.put("/{holiday_id}", response_model=schemas.SchoolHolidayRead)
def update_holiday(
    holiday_id: int, item: schemas.SchoolHolidayCreate, db: Session = Depends(get_db)
):
    row = db.get(models.SchoolHoliday, holiday_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in item.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{holiday_id}")
def delete_holiday(holiday_id: int, db: Session = Depends(get_db)):
    row = db.get(models.SchoolHoliday, holiday_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}
