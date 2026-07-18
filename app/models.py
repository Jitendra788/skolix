from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class SchoolClass(Base):
    """Master list of class names (e.g. Class 10) for dropdowns and validation."""

    __tablename__ = "school_classes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    monthly_tuition: Mapped[str] = mapped_column(String(40), default="")
    class_teacher: Mapped[str] = mapped_column(String(200), default="")

    sections: Mapped[list["SchoolClassSection"]] = relationship(
        "SchoolClassSection",
        back_populates="school_class",
        cascade="all, delete-orphan",
        order_by="SchoolClassSection.sort_order",
    )
    subjects: Mapped[list["ClassSubject"]] = relationship(
        "ClassSubject",
        back_populates="school_class",
        cascade="all, delete-orphan",
        order_by="ClassSubject.sort_order",
    )


class SchoolClassSection(Base):
    """Sections offered for a class (e.g. A, B); unique per class."""

    __tablename__ = "school_class_sections"
    __table_args__ = (
        UniqueConstraint("class_id", "section_code", name="uq_school_class_section_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    class_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("school_classes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    section_code: Mapped[str] = mapped_column(String(10), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    school_class: Mapped["SchoolClass"] = relationship(back_populates="sections")


class ClassSubject(Base):
    """Subject + total exam marks assigned to a school class."""

    __tablename__ = "class_subjects"
    __table_args__ = (
        UniqueConstraint("class_id", "subject_name", name="uq_class_subject_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    class_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("school_classes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_name: Mapped[str] = mapped_column(String(120), nullable=False)
    total_marks: Mapped[str] = mapped_column(String(40), default="")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    school_class: Mapped["SchoolClass"] = relationship(back_populates="subjects")


class SchoolAcademicYear(Base):
    """Master list of academic year labels (e.g. 2025-26)."""

    __tablename__ = "school_academic_years"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    label: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)


class SchoolFeeHead(Base):
    """Master fee head names for fee structure dropdowns (e.g. Tuition Fee)."""

    __tablename__ = "school_fee_heads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    prefix_amount: Mapped[str] = mapped_column(String(40), default="0")
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    particular_key: Mapped[str | None] = mapped_column(String(40), nullable=True, unique=True)


class SchoolFeeFrequency(Base):
    """Master frequency labels stored on fee structure rows (e.g. Annual)."""

    __tablename__ = "school_fee_frequencies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Faculty(Base):
    __tablename__ = "faculty"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    designation: Mapped[str] = mapped_column(String(120), default="")
    subject: Mapped[str] = mapped_column(String(120), default="")
    class_assigned: Mapped[str] = mapped_column(String(50), default="")
    phone: Mapped[str] = mapped_column(String(20), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    photo_url: Mapped[str] = mapped_column(String(500), default="")
    photo_data: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_joining: Mapped[str] = mapped_column(String(20), default="")
    monthly_salary: Mapped[str] = mapped_column(String(40), default="")
    guardian_name: Mapped[str] = mapped_column(String(200), default="")
    gender: Mapped[str] = mapped_column(String(20), default="")
    experience: Mapped[str] = mapped_column(String(120), default="")
    national_id: Mapped[str] = mapped_column(String(80), default="")
    religion: Mapped[str] = mapped_column(String(80), default="")
    education: Mapped[str] = mapped_column(String(200), default="")
    blood_group: Mapped[str] = mapped_column(String(10), default="")
    date_of_birth: Mapped[str] = mapped_column(String(20), default="")
    home_address: Mapped[str] = mapped_column(String(500), default="")


class FeeStructureItem(Base):
    __tablename__ = "fee_structure"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    class_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    fee_head: Mapped[str] = mapped_column(String(120), nullable=False)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    frequency: Mapped[str] = mapped_column(String(40), default="annual")
    academic_year: Mapped[str] = mapped_column(String(20), default="")


class Student(Base):
    """Roster entry — used for class-wide fee apply and parent contact for reminders."""

    __tablename__ = "students"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    admission_no: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    class_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    section: Mapped[str] = mapped_column(String(20), default="")
    parent_phone: Mapped[str] = mapped_column(String(20), default="")
    parent_name: Mapped[str] = mapped_column(String(200), default="")
    date_of_birth: Mapped[str] = mapped_column(String(20), default="")
    gender: Mapped[str] = mapped_column(String(20), default="")
    admission_extras: Mapped[str] = mapped_column(Text, default="{}")
    # Portal login (optional; username blank → admission number is used as login id).
    login_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    login_username: Mapped[str] = mapped_column(String(80), default="")
    login_password_hash: Mapped[str] = mapped_column(String(200), default="")


class StudentPromotionLog(Base):
    """Audit trail for class promotions/transfers."""

    __tablename__ = "student_promotion_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    admission_no: Mapped[str] = mapped_column(String(50), default="", index=True)
    from_class: Mapped[str] = mapped_column(String(50), default="")
    to_class: Mapped[str] = mapped_column(String(50), default="")
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class StudentFeeParticular(Base):
    """Per-student fee particular amounts (overrides class fee structure for reporting / invoices)."""

    __tablename__ = "student_fee_particulars"
    __table_args__ = (
        UniqueConstraint(
            "student_id",
            "particular_key",
            "academic_year",
            name="uq_student_fee_particular",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    student_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )
    particular_key: Mapped[str] = mapped_column(String(40), nullable=False)
    amount_text: Mapped[str] = mapped_column(String(40), default="0")
    academic_year: Mapped[str] = mapped_column(String(20), default="", index=True)


class ClassFeePlan(Base):
    """Saved schedule applied to a class for an academic year."""

    __tablename__ = "class_fee_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    class_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    academic_year: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    schedule_type: Mapped[str] = mapped_column(String(20), nullable=False)
    anchor_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    discount_per_student: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class StudentFee(Base):
    __tablename__ = "student_fees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    student_name: Mapped[str] = mapped_column(String(200), nullable=False)
    admission_no: Mapped[str] = mapped_column(String(50), index=True)
    class_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    academic_year: Mapped[str] = mapped_column(String(20), default="")
    fee_plan_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("class_fee_plans.id"), nullable=True
    )
    gross_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    discount_amount: Mapped[float] = mapped_column(Float, default=0)
    total_due: Mapped[float] = mapped_column(Float, default=0)
    total_paid: Mapped[float] = mapped_column(Float, default=0)
    last_payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    remarks: Mapped[str] = mapped_column(Text, default="")
    recorded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    installments: Mapped[list["FeeInstallment"]] = relationship(
        "FeeInstallment",
        back_populates="student_fee",
        cascade="all, delete-orphan",
        order_by="FeeInstallment.sequence_no",
    )
    payment_logs: Mapped[list["FeePaymentLog"]] = relationship(
        "FeePaymentLog",
        back_populates="student_fee",
        cascade="all, delete-orphan",
    )
    concession_logs: Mapped[list["FeeConcessionLog"]] = relationship(
        "FeeConcessionLog",
        back_populates="student_fee",
        cascade="all, delete-orphan",
    )


class FeeInstallment(Base):
    __tablename__ = "fee_installments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    student_fee_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("student_fees.id"), nullable=False, index=True
    )
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    amount_paid: Mapped[float] = mapped_column(Float, default=0)
    overdue_notified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    student_fee: Mapped["StudentFee"] = relationship(
        "StudentFee", back_populates="installments"
    )


class FeePaymentLog(Base):
    """Append-only record of each fee payment (amount, time, how it was split across slips)."""

    __tablename__ = "fee_payment_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    student_fee_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("student_fees.id"), nullable=False, index=True
    )
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    paid_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    source: Mapped[str] = mapped_column(String(40), default="")
    allocation_json: Mapped[str] = mapped_column(Text, default="[]")
    notes: Mapped[str] = mapped_column(String(500), default="")

    student_fee: Mapped["StudentFee"] = relationship(
        "StudentFee", back_populates="payment_logs"
    )


class FeeConcessionLog(Base):
    """Append-only history of total concession (discount) changes with when they were recorded."""

    __tablename__ = "fee_concession_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    student_fee_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("student_fees.id"), nullable=False, index=True
    )
    concession_before: Mapped[float] = mapped_column(Float, nullable=False)
    concession_after: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String(40), default="")
    notes: Mapped[str] = mapped_column(String(500), default="")
    changed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # JSON: [{installment_id, sequence_no, label, before, after}, ...] for open slips only.
    allocation_json: Mapped[str] = mapped_column(Text, default="[]")

    student_fee: Mapped["StudentFee"] = relationship(
        "StudentFee", back_populates="concession_logs"
    )


class Notice(Base):
    __tablename__ = "notices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, default="")
    audience: Mapped[str] = mapped_column(String(50), default="all")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class WhatsAppBroadcast(Base):
    __tablename__ = "whatsapp_broadcasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    class_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="queued")
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    admission_no: Mapped[str] = mapped_column(String(50), default="")
    parent_phone: Mapped[str] = mapped_column(String(20), default="")


class PTMUpdate(Base):
    __tablename__ = "ptm_updates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    class_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    venue: Mapped[str] = mapped_column(String(200), default="")
    agenda: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class GalleryImage(Base):
    __tablename__ = "gallery_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    event_name: Mapped[str] = mapped_column(String(200), default="")
    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    taken_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AttendanceRecord(Base):
    __tablename__ = "attendance"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    student_name: Mapped[str] = mapped_column(String(200), nullable=False)
    admission_no: Mapped[str] = mapped_column(String(50), index=True)
    class_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    section: Mapped[str] = mapped_column(String(20), default="")
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    academic_year: Mapped[str] = mapped_column(String(20), default="")
    present: Mapped[bool] = mapped_column(Boolean, default=True)
    remarks: Mapped[str] = mapped_column(String(300), default="")
    application_received: Mapped[bool] = mapped_column(Boolean, default=False)
    application_notes: Mapped[str] = mapped_column(String(500), default="")


class SchoolHoliday(Base):
    __tablename__ = "school_holidays"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    holiday_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    notes: Mapped[str] = mapped_column(String(500), default="")


class InstituteProfile(Base):
    """Single-row institute branding and contact (id always 1)."""

    __tablename__ = "institute_profile"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    logo_data: Mapped[str] = mapped_column(Text, default="")
    name: Mapped[str] = mapped_column(String(200), default="")
    tagline: Mapped[str] = mapped_column(String(300), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    website: Mapped[str] = mapped_column(String(500), default="")
    address: Mapped[str] = mapped_column(String(500), default="")
    country: Mapped[str] = mapped_column(String(120), default="")
    established_on: Mapped[str] = mapped_column(String(20), default="")
    # percentage | fixed_amount | none — default policy for fee discounts (general settings).
    discount_type: Mapped[str] = mapped_column(String(40), default="percentage")
