from datetime import date, datetime
from typing import Literal

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
)


class FacultyBase(BaseModel):
    name: str
    designation: str = ""
    subject: str = ""
    class_assigned: str = ""
    phone: str = ""
    email: str = ""
    photo_url: str = ""
    photo_data: str | None = None
    date_joining: str = ""
    monthly_salary: str = ""
    guardian_name: str = ""
    gender: str = ""
    experience: str = ""
    national_id: str = ""
    religion: str = ""
    education: str = ""
    blood_group: str = ""
    date_of_birth: str = ""
    home_address: str = ""


class FacultyCreate(FacultyBase):
    pass


class FacultyRead(FacultyBase):
    id: int
    login_enabled: bool = False
    login_username: str = ""
    has_login_password: bool = False

    model_config = ConfigDict(from_attributes=True)


class FacultyPortalLoginPatch(BaseModel):
    login_enabled: bool
    login_username: str = ""
    new_password: str = ""
    clear_password: bool = False


class SchoolClassBase(BaseModel):
    name: str
    sort_order: int = 0
    monthly_tuition: str = ""
    class_teacher: str = ""


class SchoolClassCreate(SchoolClassBase):
    """Optional section codes when creating a class (e.g. A, B)."""

    initial_sections: list[str] | None = None


class SchoolClassRead(SchoolClassBase):
    id: int
    sections: list[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class SchoolClassSectionsPut(BaseModel):
    """Replace all sections for a class; duplicates in the list are rejected."""

    section_codes: list[str] = Field(default_factory=list)


class ClassSubjectRowPut(BaseModel):
    subject_name: str
    total_marks: str = ""


class ClassSubjectsPut(BaseModel):
    """Replace all subject rows for a class."""

    rows: list[ClassSubjectRowPut] = Field(default_factory=list)


class ClassSubjectRead(BaseModel):
    id: int
    subject_name: str
    total_marks: str = ""
    sort_order: int = 0

    model_config = ConfigDict(from_attributes=True)


class ClassSubjectsOverviewRow(BaseModel):
    class_id: int
    class_name: str
    subjects: list[ClassSubjectRead] = Field(default_factory=list)


class SchoolClassReorder(BaseModel):
    """Every class id exactly once, in desired display order (first = lowest sort_order)."""

    class_ids: list[int] = Field(default_factory=list)


class SchoolAcademicYearBase(BaseModel):
    label: str
    sort_order: int = 0
    is_current: bool = False


class SchoolAcademicYearCreate(SchoolAcademicYearBase):
    pass


class SchoolAcademicYearRead(SchoolAcademicYearBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class SchoolFeeHeadBase(BaseModel):
    name: str
    sort_order: int = 0
    prefix_amount: str = "0"
    is_locked: bool = False


class SchoolFeeHeadCreate(SchoolFeeHeadBase):
    pass


class SchoolFeeHeadRead(SchoolFeeHeadBase):
    id: int
    particular_key: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SchoolFeeFrequencyBase(BaseModel):
    name: str
    sort_order: int = 0


class SchoolFeeFrequencyCreate(SchoolFeeFrequencyBase):
    pass


class SchoolFeeFrequencyRead(SchoolFeeFrequencyBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class FeeStructureBase(BaseModel):
    class_name: str
    fee_head: str
    amount: float
    frequency: str = "annual"
    academic_year: str = ""


class FeeStructureCreate(FeeStructureBase):
    pass


class FeeStructureRead(FeeStructureBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class FeeStructureCellIn(BaseModel):
    class_name: str
    fee_head: str
    amount: float = 0
    frequency: str | None = None


class FeeStructureBulkUpsert(BaseModel):
    academic_year: str
    """Fallback when a cell omits frequency (optional)."""
    frequency: str | None = None
    cells: list[FeeStructureCellIn]


class StudentFeeBase(BaseModel):
    student_name: str
    admission_no: str
    class_name: str
    academic_year: str = ""
    fee_plan_id: int | None = None
    gross_total: float | None = None
    discount_amount: float = 0
    total_due: float = 0
    total_paid: float = 0
    last_payment_date: date | None = None
    remarks: str = ""


class StudentFeeCreate(StudentFeeBase):
    pass


class StudentFeeRead(StudentFeeBase):
    id: int
    recorded_at: datetime | None = None
    # Section from student roster (same admission no.), if any.
    section: str = ""

    model_config = ConfigDict(from_attributes=True)


class FeePaymentLogRead(BaseModel):
    id: int
    student_fee_id: int
    amount: float
    paid_at: datetime
    source: str
    allocation_json: str
    notes: str

    model_config = ConfigDict(from_attributes=True)


class FeeConcessionLogRead(BaseModel):
    id: int
    student_fee_id: int
    concession_before: float
    concession_after: float
    source: str
    notes: str
    changed_at: datetime
    allocation_json: str = "[]"

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def delta(self) -> float:
        return round(self.concession_after - self.concession_before, 2)


class FeeStructureTotalRead(BaseModel):
    class_name: str
    academic_year: str
    total: float


class FeeParticularRowRead(BaseModel):
    fee_head_id: int
    particular_key: str | None = None
    label: str
    amount_text: str
    is_locked: bool
    """True when amount cannot be edited (locked head or template prefix FIXED)."""
    readonly_amount: bool = False
    """Where the displayed amount came from: template, class_structure, or student_override."""
    source: str = "template"


class FeeParticularSheetRead(BaseModel):
    scope: Literal["class", "student"]
    class_name: str | None = None
    student_id: int | None = None
    student_name: str | None = None
    admission_no: str | None = None
    academic_year: str
    rows: list[FeeParticularRowRead]


class FeeParticularRowWrite(BaseModel):
    particular_key: str
    amount_text: str = "0"


class FeeParticularSheetWrite(BaseModel):
    scope: Literal["class", "student"]
    class_name: str | None = None
    student_id: int | None = None
    academic_year: str
    rows: list[FeeParticularRowWrite]


class NoticeBase(BaseModel):
    title: str
    body: str = ""
    audience: str = "all"
    pinned: bool = False


class NoticeCreate(NoticeBase):
    pass


class NoticeRead(NoticeBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HomeworkBase(BaseModel):
    date: date
    academic_year: str = ""
    class_name: str = Field(
        validation_alias=AliasChoices("class_name", "class"),
        serialization_alias="class",
    )
    section: str = ""
    teacher_name: str = Field(
        validation_alias=AliasChoices("teacher_name", "teacher"),
        serialization_alias="teacher",
    )
    subject: str = ""
    description: str = ""
    due_date: date | None = None
    marks: str = ""
    attachment_name: str = ""

    model_config = ConfigDict(populate_by_name=True)


class HomeworkCreate(HomeworkBase):
    pass


class HomeworkRead(HomeworkBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WhatsAppBroadcastCreate(BaseModel):
    class_name: str
    message: str
    admission_no: str = ""
    parent_phone: str = ""
    status: str = ""


class WhatsAppBroadcastRead(BaseModel):
    id: int
    class_name: str
    message: str
    status: str
    sent_at: datetime | None
    created_at: datetime
    admission_no: str = ""
    parent_phone: str = ""

    model_config = ConfigDict(from_attributes=True)


class WhatsAppGroupSendResult(BaseModel):
    class_name: str
    message: str
    status: str
    queued_count: int = 0
    skipped_count: int = 0


class WhatsAppDueFeesSendCreate(BaseModel):
    class_name: str
    academic_year: str
    message_template: str = ""


class WhatsAppDueFeesSendResult(BaseModel):
    class_name: str
    academic_year: str
    status: str
    queued_count: int = 0
    skipped_count: int = 0
    total_due_sum: float = 0


class SmsSendCreate(BaseModel):
    phone_number: str
    message: str
    status: str = ""


class SmsSendResult(BaseModel):
    id: int
    phone_number: str
    message: str
    status: str
    sent_at: datetime | None


class PTMUpdateBase(BaseModel):
    class_name: str
    scheduled_at: datetime
    venue: str = ""
    agenda: str = ""


class PTMUpdateCreate(PTMUpdateBase):
    pass


class PTMUpdateRead(PTMUpdateBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GalleryImageBase(BaseModel):
    title: str
    event_name: str = ""
    image_url: str
    taken_on: date | None = None


class GalleryImageCreate(GalleryImageBase):
    pass


class GalleryImageRead(GalleryImageBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AttendanceBase(BaseModel):
    student_name: str
    admission_no: str
    class_name: str
    section: str = ""
    date: date
    academic_year: str = ""
    present: bool = True
    remarks: str = ""
    application_received: bool = False
    application_notes: str = ""


class AttendanceCreate(AttendanceBase):
    pass


class AttendanceRead(AttendanceBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class AttendanceDayStudent(BaseModel):
    admission_no: str
    student_name: str
    section: str = ""
    present: bool = True
    remarks: str = ""
    application_received: bool = False
    application_notes: str = ""


class AttendanceUpsertDay(BaseModel):
    class_name: str
    date: date
    academic_year: str = ""
    rows: list[AttendanceDayStudent]


class SchoolHolidayBase(BaseModel):
    holiday_date: date
    name: str
    notes: str = ""


class SchoolHolidayCreate(SchoolHolidayBase):
    pass


class SchoolHolidayRead(SchoolHolidayBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class InstituteProfileRead(BaseModel):
    id: int
    logo_data: str = ""
    name: str = ""
    tagline: str = ""
    phone: str = ""
    email: str = ""
    website: str = ""
    address: str = ""
    country: str = ""
    established_on: str = ""
    discount_type: str = "percentage"

    model_config = ConfigDict(from_attributes=True)


class InstituteProfileUpdate(BaseModel):
    logo_data: str | None = None
    name: str | None = None
    tagline: str | None = None
    phone: str | None = None
    email: str | None = None
    website: str | None = None
    address: str | None = None
    country: str | None = None
    established_on: str | None = None
    discount_type: str | None = None

    @field_validator("discount_type")
    @classmethod
    def validate_discount_type(cls, v: str | None) -> str | None:
        if v is None:
            return v
        s = v.strip().lower()
        allowed = frozenset({"percentage", "fixed_amount", "none"})
        if s not in allowed:
            raise ValueError("discount_type must be percentage, fixed_amount, or none")
        return s


class SchoolHolidayRecurringCreate(BaseModel):
    date_from: date
    date_to: date
    """0=Sunday, 1=Monday, … 6=Saturday (same numbering as JavaScript Date.getDay())."""
    weekday: int = Field(ge=0, le=6, description="0=Sun … 6=Sat")
    name: str
    notes: str = ""
    skip_if_date_has_holiday: bool = True


# --- Students (roster) ---


class StudentBase(BaseModel):
    admission_no: str
    full_name: str
    class_name: str
    section: str = ""
    parent_phone: str = ""
    parent_name: str = ""
    date_of_birth: str = ""
    gender: str = ""
    admission_extras: dict = Field(default_factory=dict)


class StudentCreate(StudentBase):
    pass


class StudentRead(StudentBase):
    id: int
    login_enabled: bool = False
    login_username: str = ""
    has_login_password: bool = False

    model_config = ConfigDict(from_attributes=True)


class StudentPortalLoginPatch(BaseModel):
    login_enabled: bool
    """Custom login id; empty string means use admission number."""
    login_username: str = ""
    """When non-empty, sets a new password (bcrypt). Ignored if clear_password is true."""
    new_password: str = ""
    """Remove stored password and disable login."""
    clear_password: bool = False


class StudentSelfProfilePatch(BaseModel):
    """Fields a logged-in student may update for their own record (JWT required)."""

    full_name: str | None = None
    parent_phone: str | None = None
    parent_name: str | None = None
    date_of_birth: str | None = None
    gender: str | None = None
    profile_photo_url: str | None = None


class StudentListPage(BaseModel):
    items: list[StudentRead]
    total: int
    skip: int
    limit: int


class StudentLastAdmission(BaseModel):
    last_admission_no: str = ""


class StudentImportSuccessItem(BaseModel):
    row_number: int
    admission_no: str
    full_name: str
    class_name: str


class StudentImportFailureItem(BaseModel):
    row_number: int
    admission_no: str = ""
    full_name: str = ""
    reason: str


class StudentBulkImportResult(BaseModel):
    file_name: str = ""
    total_rows: int = 0
    success_count: int = 0
    failure_count: int = 0
    submitted: list[StudentImportSuccessItem] = Field(default_factory=list)
    failed: list[StudentImportFailureItem] = Field(default_factory=list)


# --- Class fee bulk apply & installments ---


class ClassBulkFeeApply(BaseModel):
    class_name: str
    academic_year: str
    schedule_type: str
    anchor_date: date
    total_amount: float | None = None
    discount_per_student: float = 0


class FeeInstallmentRead(BaseModel):
    id: int
    student_fee_id: int
    sequence_no: int
    label: str
    due_date: date
    amount: float
    amount_paid: float
    overdue_notified_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class InstallmentPaymentApply(BaseModel):
    amount: float
    paid_on: date | None = Field(
        default=None,
        description="Payment date for this receipt (defaults to today on server).",
    )


class FeeApplyPaymentBody(BaseModel):
    """Apply payment to the fee balance (ledger-first). Optional note appears on the receipt row."""

    amount: float = Field(default=0, ge=0)
    additional_concession: float = Field(default=0, ge=0)
    paid_on: date | None = None
    note: str = Field(default="", max_length=240, description="Optional note on payment receipt")

    @model_validator(mode="after")
    def require_positive_action(self):
        if self.amount <= 0 and self.additional_concession <= 0:
            raise ValueError(
                "Provide a positive payment amount and/or additional concession."
            )
        return self


class FeeBillingMonthRow(BaseModel):
    label: str
    due_date: date
    amount: float
    status: str
    covered: float = 0


class FeeBillingProgressRead(BaseModel):
    """Month / period view for collect-fee screen (ledger-first; legacy slips still listed)."""

    schedule_type: str | None = None
    frequency_label: str = ""
    total_due: float
    total_paid: float
    balance_due: float
    has_legacy_slips: bool
    periods: list[FeeBillingMonthRow]
    receipt_hint: str


class FeeApplyPaymentResult(BaseModel):
    student_fee: StudentFeeRead
    amount_applied: float
    amount_unapplied: float


class FeeConcessionUpdate(BaseModel):
    """Admin: set total concession; rescales installments when a plan exists."""

    discount_amount: float = Field(ge=0)
    note: str = ""
    changed_on: date | None = Field(
        default=None,
        description="Calendar date stored on the concession log (defaults to today).",
    )


class FeeApplyStructureToClassBody(BaseModel):
    class_name: str
    academic_year: str
    replace_existing: bool = False
    consolidated_due_date: date | None = Field(
        default=None,
        description="Due date for the single consolidated installment (defaults to today).",
    )


class FeeApplyStructureToClassResult(BaseModel):
    class_name: str
    academic_year: str
    per_student_gross: float
    created: int
    skipped: int
    replaced: int
    skipped_with_payments: int = 0


class ClassFeePlanRead(BaseModel):
    id: int
    class_name: str
    academic_year: str
    schedule_type: str
    anchor_date: date
    total_amount: float
    discount_per_student: float = 0
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CurrentAcademicYearRead(BaseModel):
    academic_year: str
    as_of_date: date


class OverdueProcessResult(BaseModel):
    notified_count: int
    details: list[dict]
    academic_year_used: str = ""
    as_of: str = ""


# --- Dashboard home ---


class DashboardIncomeMonth(BaseModel):
    year_month: str
    income: float = 0
    expenses: float = 0


class DashboardFeeSummary(BaseModel):
    estimation_total: float
    collected_total: float
    remaining_total: float
    collected_this_month: float


class DashboardStudentAttendance(BaseModel):
    marked: bool
    present_pct: int = 0
    absent_count: int = 0
    present_count: int = 0
    total_marked: int = 0


class DashboardEmployeeAttendance(BaseModel):
    marked: bool
    present_pct: int = 0


class DashboardNewAdmission(BaseModel):
    admission_no: str
    full_name: str
    class_name: str


class DashboardAbsentStudent(BaseModel):
    admission_no: str
    full_name: str
    class_name: str


class DashboardSummary(BaseModel):
    as_of_date: date
    income_by_month: list[DashboardIncomeMonth]
    fee: DashboardFeeSummary
    student_attendance: DashboardStudentAttendance
    employee_attendance: DashboardEmployeeAttendance
    fee_collection_month_pct: int
    new_admissions: list[DashboardNewAdmission]
    absent_students_today: list[DashboardAbsentStudent]


# --- Student consolidated report (dashboard-style PDF view) ---


class StudentReportProfile(BaseModel):
    id: int
    full_name: str
    admission_no: str
    class_name: str
    section: str = ""
    parent_name: str = ""
    parent_phone: str = ""
    date_of_birth: str = ""
    date_of_admission: str | None = None
    discount_fee_percent: int = 0


class StudentReportDayMark(BaseModel):
    """How a calendar day was interpreted from attendance rows."""

    label: str
    status: str
    """NOT_MARKED | PRESENT | ABSENT | ON_LEAVE"""


class StudentReportAttendance(BaseModel):
    presents_total: int = 0
    leaves_total: int = 0
    absents_total: int = 0
    presents_this_month: int = 0
    leaves_this_month: int = 0
    absents_this_month: int = 0
    overall_percent: int = 0
    month_percent: int = 0
    month_label: str = ""
    today: StudentReportDayMark
    yesterday: StudentReportDayMark


class StudentReportClassTestSubject(BaseModel):
    subject: str
    total_tests: int = 0
    total_marks: float = 0
    obtained_marks: float = 0
    percent: int = 0


class StudentReportExamBlock(BaseModel):
    has_records: bool = False
    message: str = "No Record Found."


class StudentReportFee(BaseModel):
    has_record: bool = False
    period_label: str = ""
    period_due: float = 0
    period_paid: float = 0
    balance: float = 0
    status: str = "none"
    """paid | partially_paid | unpaid | none"""
    academic_year: str = ""


class StudentPromotionLogRead(BaseModel):
    from_class: str = ""
    to_class: str = ""
    changed_at: datetime


class StudentReportResponse(BaseModel):
    profile: StudentReportProfile
    attendance: StudentReportAttendance
    class_tests: list[StudentReportClassTestSubject] = Field(default_factory=list)
    examinations: StudentReportExamBlock = Field(default_factory=StudentReportExamBlock)
    fee: StudentReportFee = Field(default_factory=StudentReportFee)
    promotions: list[StudentPromotionLogRead] = Field(default_factory=list)


class AuthLoginRequest(BaseModel):
    role: Literal["admin", "teacher", "student"]
    login_id: str
    password: str


class AuthLoginResponse(BaseModel):
    token: str
    role: Literal["admin", "teacher", "student"]
    user_id: str
    display_name: str
    class_assigned: str = ""


class AuthMeResponse(BaseModel):
    role: str
    user_id: str
    display_name: str
    class_assigned: str = ""
