"""Aggregated metrics for the admin home dashboard."""

from __future__ import annotations

from calendar import monthrange
from collections import defaultdict
from datetime import date, datetime, time

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _month_first(d: date) -> date:
    return date(d.year, d.month, 1)


def _add_months(d: date, delta: int) -> date:
    y, m = d.year, d.month + delta
    while m > 12:
        m -= 12
        y += 1
    while m < 1:
        m += 12
        y -= 1
    return date(y, m, 1)


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


@router.get("/summary", response_model=schemas.DashboardSummary)
def dashboard_summary(db: Session = Depends(get_db)):
    today = date.today()
    month_start = _month_first(today)
    last_dom = monthrange(today.year, today.month)[1]
    month_end = date(today.year, today.month, last_dom)
    month_start_dt = datetime.combine(month_start, time.min)
    month_end_dt = datetime.combine(month_end, time.max)

    collected_m = (
        db.query(func.coalesce(func.sum(models.FeePaymentLog.amount), 0.0))
        .filter(
            models.FeePaymentLog.paid_at >= month_start_dt,
            models.FeePaymentLog.paid_at <= month_end_dt,
        )
        .scalar()
        or 0.0
    )

    total_due = (
        db.query(func.coalesce(func.sum(models.StudentFee.total_due), 0.0)).scalar()
        or 0.0
    )
    total_paid = (
        db.query(func.coalesce(func.sum(models.StudentFee.total_paid), 0.0)).scalar()
        or 0.0
    )
    remaining = max(0.0, float(total_due) - float(total_paid))
    estimation = max(float(total_due), float(total_paid), remaining)

    month_target = max(float(total_due) / 12.0, float(collected_m), 1.0)
    fee_collection_month_pct = min(
        100, int(round(100.0 * float(collected_m) / month_target))
    )

    # Last 6 calendar months including current — fee income from payment logs
    start_chart = _add_months(_month_first(today), -5)
    start_chart_dt = datetime.combine(start_chart, time.min)
    ym_sums: dict[str, float] = defaultdict(float)
    rows = (
        db.query(
            func.strftime("%Y-%m", models.FeePaymentLog.paid_at).label("ym"),
            func.sum(models.FeePaymentLog.amount).label("amt"),
        )
        .filter(models.FeePaymentLog.paid_at >= start_chart_dt)
        .group_by("ym")
        .all()
    )
    for ym, amt in rows:
        if ym:
            ym_sums[str(ym)] = float(amt or 0)

    income_points: list[schemas.DashboardIncomeMonth] = []
    cur = start_chart
    for _ in range(6):
        key = _month_key(cur)
        income_points.append(
            schemas.DashboardIncomeMonth(
                year_month=key,
                income=round(ym_sums.get(key, 0.0), 2),
                expenses=0.0,
            )
        )
        cur = _add_months(cur, 1)

    att = (
        db.query(models.AttendanceRecord)
        .filter(models.AttendanceRecord.date == today)
        .all()
    )
    if not att:
        st_att = schemas.DashboardStudentAttendance(
            marked=False,
            present_pct=0,
            absent_count=0,
            present_count=0,
            total_marked=0,
        )
    else:
        pr = sum(1 for r in att if r.present)
        tot = len(att)
        ab = tot - pr
        st_att = schemas.DashboardStudentAttendance(
            marked=True,
            present_pct=min(100, int(round(100.0 * pr / tot))) if tot else 0,
            absent_count=ab,
            present_count=pr,
            total_marked=tot,
        )

    em_att = schemas.DashboardEmployeeAttendance(marked=False, present_pct=0)

    new_rows = (
        db.query(models.Student)
        .order_by(models.Student.id.desc())
        .limit(8)
        .all()
    )
    new_admissions = [
        schemas.DashboardNewAdmission(
            admission_no=r.admission_no,
            full_name=r.full_name,
            class_name=r.class_name,
        )
        for r in new_rows
    ]

    absent_today = [
        schemas.DashboardAbsentStudent(
            admission_no=r.admission_no,
            full_name=r.student_name,
            class_name=r.class_name,
        )
        for r in att
        if not r.present
    ][:12]

    return schemas.DashboardSummary(
        as_of_date=today,
        income_by_month=income_points,
        fee=schemas.DashboardFeeSummary(
            estimation_total=round(estimation, 2),
            collected_total=round(float(total_paid), 2),
            remaining_total=round(remaining, 2),
            collected_this_month=round(float(collected_m), 2),
        ),
        student_attendance=st_att,
        employee_attendance=em_att,
        fee_collection_month_pct=fee_collection_month_pct,
        new_admissions=new_admissions,
        absent_students_today=absent_today,
    )
