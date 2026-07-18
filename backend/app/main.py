from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from .database import Base, engine, SessionLocal
from . import models
from .routers import (
    auth,
    attendance,
    dashboard,
    faculty,
    fees,
    gallery,
    homeworks,
    holidays,
    institute_profile,
    notices,
    ptm,
    school_reference,
    students,
    whatsapp,
)


def migrate_sqlite() -> None:
    if "sqlite" not in str(engine.url).lower():
        return
    insp = inspect(engine)
    alters = [
        ("student_fees", "academic_year", "VARCHAR(20) DEFAULT ''"),
        ("student_fees", "fee_plan_id", "INTEGER"),
        ("student_fees", "gross_total", "FLOAT"),
        ("student_fees", "discount_amount", "REAL DEFAULT 0"),
        ("student_fees", "recorded_at", "DATETIME"),
        ("class_fee_plans", "discount_per_student", "REAL DEFAULT 0"),
        ("whatsapp_broadcasts", "admission_no", "VARCHAR(50) DEFAULT ''"),
        ("whatsapp_broadcasts", "parent_phone", "VARCHAR(20) DEFAULT ''"),
        ("fee_concession_logs", "allocation_json", "TEXT DEFAULT '[]'"),
        ("students", "section", "VARCHAR(20) DEFAULT ''"),
        ("students", "date_of_birth", "VARCHAR(20) DEFAULT ''"),
        ("students", "gender", "VARCHAR(20) DEFAULT ''"),
        ("students", "admission_extras", "TEXT DEFAULT '{}'"),
        ("institute_profile", "established_on", "VARCHAR(20) DEFAULT ''"),
        ("institute_profile", "discount_type", "VARCHAR(40) DEFAULT 'percentage'"),
        ("attendance", "section", "VARCHAR(20) DEFAULT ''"),
        ("attendance", "academic_year", "VARCHAR(20) DEFAULT ''"),
        ("attendance", "application_received", "INTEGER DEFAULT 0"),
        ("attendance", "application_notes", "VARCHAR(500) DEFAULT ''"),
        ("faculty", "photo_data", "TEXT"),
        ("faculty", "date_joining", "VARCHAR(20) DEFAULT ''"),
        ("faculty", "monthly_salary", "VARCHAR(40) DEFAULT ''"),
        ("faculty", "guardian_name", "VARCHAR(200) DEFAULT ''"),
        ("faculty", "gender", "VARCHAR(20) DEFAULT ''"),
        ("faculty", "experience", "VARCHAR(120) DEFAULT ''"),
        ("faculty", "national_id", "VARCHAR(80) DEFAULT ''"),
        ("faculty", "religion", "VARCHAR(80) DEFAULT ''"),
        ("faculty", "education", "VARCHAR(200) DEFAULT ''"),
        ("faculty", "blood_group", "VARCHAR(10) DEFAULT ''"),
        ("faculty", "date_of_birth", "VARCHAR(20) DEFAULT ''"),
        ("faculty", "home_address", "VARCHAR(500) DEFAULT ''"),
        ("faculty", "login_enabled", "INTEGER DEFAULT 0"),
        ("faculty", "login_username", "VARCHAR(80) DEFAULT ''"),
        ("faculty", "login_password_hash", "VARCHAR(200) DEFAULT ''"),
        ("school_fee_heads", "prefix_amount", "VARCHAR(40) DEFAULT '0'"),
        ("school_fee_heads", "is_locked", "INTEGER DEFAULT 0"),
        ("school_fee_heads", "particular_key", "VARCHAR(40)"),
        ("school_classes", "monthly_tuition", "VARCHAR(40) DEFAULT ''"),
        ("school_classes", "class_teacher", "VARCHAR(200) DEFAULT ''"),
        ("homeworks", "academic_year", "VARCHAR(40) DEFAULT ''"),
        ("homeworks", "section", "VARCHAR(20) DEFAULT ''"),
        ("homeworks", "due_date", "VARCHAR(20)"),
        ("homeworks", "marks", "VARCHAR(40) DEFAULT ''"),
        ("students", "login_enabled", "INTEGER DEFAULT 0"),
        ("students", "login_username", "VARCHAR(80) DEFAULT ''"),
        ("students", "login_password_hash", "VARCHAR(200) DEFAULT ''"),
    ]
    for table, col, ddl in alters:
        cols = {c["name"] for c in insp.get_columns(table)}
        if col not in cols:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
        insp = inspect(engine)


def seed_demo_data():
    db = SessionLocal()
    try:
        if not db.query(models.Faculty).first():
            db.add_all(
                [
                    models.Faculty(
                        name="Mrs. Anjali Sharma",
                        designation="Principal",
                        subject="Administration",
                        class_assigned="—",
                        phone="9876500001",
                        email="principal@dungrana.edu",
                    ),
                    models.Faculty(
                        name="Mr. Rohit Verma",
                        designation="Teacher",
                        subject="Mathematics",
                        class_assigned="Class 10",
                        phone="9876500002",
                        email="rohit.verma@dungrana.edu",
                    ),
                ]
            )
            db.add(
                models.Notice(
                    title="Welcome to the new academic session",
                    body="School reopens on 1 April. Timings: 8:00 AM – 2:00 PM.",
                    audience="all",
                    pinned=True,
                )
            )
            db.add(
                models.GalleryImage(
                    title="Annual Day 2025",
                    event_name="Annual Function",
                    image_url="https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800",
                )
            )
            db.commit()

        ref_seeded = False
        if not db.query(models.SchoolClass).first():
            db.add_all(
                [
                    models.SchoolClass(name="Class 1", sort_order=10),
                    models.SchoolClass(name="Class 10", sort_order=100),
                ]
            )
            ref_seeded = True
        if not db.query(models.SchoolAcademicYear).first():
            db.add_all(
                [
                    models.SchoolAcademicYear(
                        label="2024-25", sort_order=0, is_current=False
                    ),
                    models.SchoolAcademicYear(
                        label="2025-26", sort_order=1, is_current=True
                    ),
                ]
            )
            ref_seeded = True
        if not db.query(models.SchoolFeeHead).first():
            db.add_all(
                [
                    models.SchoolFeeHead(name="New Admission Fee", sort_order=10),
                    models.SchoolFeeHead(name="Sports Fee", sort_order=20),
                    models.SchoolFeeHead(name="Tuition Fee", sort_order=30),
                    models.SchoolFeeHead(name="Exam Fee", sort_order=40),
                    models.SchoolFeeHead(name="Transport Fee", sort_order=50),
                ]
            )
            ref_seeded = True
        if not db.query(models.SchoolFeeFrequency).first():
            db.add_all(
                [
                    models.SchoolFeeFrequency(name="Annual", sort_order=10),
                    models.SchoolFeeFrequency(name="Half-yearly", sort_order=20),
                    models.SchoolFeeFrequency(name="Quarterly", sort_order=30),
                    models.SchoolFeeFrequency(name="Monthly", sort_order=40),
                    models.SchoolFeeFrequency(name="One-time", sort_order=50),
                ]
            )
            ref_seeded = True
        if ref_seeded:
            db.commit()

        if not db.query(models.Student).first():
            db.add_all(
                [
                    models.Student(
                        admission_no="DPS-1001",
                        full_name="Aarav Singh",
                        class_name="Class 10",
                        parent_phone="9876510001",
                        parent_name="Mr. Singh",
                        gender="Male",
                    ),
                    models.Student(
                        admission_no="DPS-1002",
                        full_name="Isha Gupta",
                        class_name="Class 10",
                        parent_phone="9876510002",
                        parent_name="Mrs. Gupta",
                        gender="Female",
                    ),
                    models.Student(
                        admission_no="DPS-0101",
                        full_name="Riya Mehta",
                        class_name="Class 1",
                        parent_phone="9876510101",
                        parent_name="Mr. Mehta",
                        gender="Female",
                    ),
                ]
            )
            db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    migrate_sqlite()
    seed_demo_data()
    db = SessionLocal()
    try:
        from .routers.school_reference import ensure_fee_particular_rows
        from .routers.students import sync_students_missing_portal_passwords
        from .routers.faculty import sync_faculty_missing_portal_passwords

        ensure_fee_particular_rows(db)
        sync_students_missing_portal_passwords(db)
        sync_faculty_missing_portal_passwords(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Dungrana Public School API",
    description="Backend for notices, faculty, PTM, gallery, attendance, WhatsApp queues, and school reference data.",
    version="0.1.0",
    lifespan=lifespan,
)

_cors_extra = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "http://127.0.0.1:4200",
        "http://localhost:4201",
        "http://127.0.0.1:4201",
        *_cors_extra,
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(faculty.router, prefix="/api")
app.include_router(students.router, prefix="/api")
app.include_router(school_reference.router, prefix="/api")
app.include_router(notices.router, prefix="/api")
app.include_router(whatsapp.router, prefix="/api")
app.include_router(ptm.router, prefix="/api")
app.include_router(gallery.router, prefix="/api")
app.include_router(attendance.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(holidays.router, prefix="/api")
app.include_router(institute_profile.router, prefix="/api")
app.include_router(fees.router, prefix="/api")
app.include_router(homeworks.router, prefix="/api")
app.include_router(homeworks.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
