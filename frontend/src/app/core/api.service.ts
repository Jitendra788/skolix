import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { SessionService } from './session.service';
import { environment } from '../../environments/environment';

function resolveApiOrigin(): string {
  if (typeof window !== 'undefined') {
    const w = window as Window & { __SKOLIX_API_ORIGIN__?: string };
    const fromWindow = (w.__SKOLIX_API_ORIGIN__ || '').trim();
    if (fromWindow && !fromWindow.includes('REPLACE_WITH_YOUR_API')) {
      return fromWindow.replace(/\/$/, '');
    }
  }
  return (environment.apiOrigin || '').replace(/\/$/, '');
}

/** Backend origin from environment / runtime env.js */
const API_ORIGIN = resolveApiOrigin();
const API = `${API_ORIGIN}/api`;

export type AuthRole = 'admin' | 'teacher' | 'student';

export interface AuthLoginRequest {
  role: AuthRole;
  login_id: string;
  password: string;
}

export interface AuthLoginResponse {
  token: string;
  role: AuthRole;
  user_id: string;
  display_name: string;
  /** Faculty class assigned (teacher login only). */
  class_assigned?: string;
}

export interface AuthMeResponse {
  role: string;
  user_id: string;
  display_name: string;
  class_assigned?: string;
}

export interface Faculty {
  id: number;
  name: string;
  designation: string;
  subject: string;
  class_assigned: string;
  phone: string;
  email: string;
  photo_url: string;
  photo_data: string | null;
  date_joining: string;
  monthly_salary: string;
  guardian_name: string;
  gender: string;
  experience: string;
  national_id: string;
  religion: string;
  education: string;
  blood_group: string;
  date_of_birth: string;
  home_address: string;
  login_enabled?: boolean;
  login_username?: string;
  has_login_password?: boolean;
}

export interface FacultyPortalLoginPatch {
  login_enabled: boolean;
  login_username?: string;
  new_password?: string;
  clear_password?: boolean;
}

export interface Notice {
  id: number;
  title: string;
  body: string;
  audience: string;
  pinned: boolean;
  created_at: string;
}

export interface WhatsAppBroadcast {
  id: number;
  class_name: string;
  message: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  admission_no?: string;
  parent_phone?: string;
}

export interface WhatsAppGroupSendResult {
  class_name: string;
  message: string;
  status: string;
  queued_count: number;
  skipped_count: number;
}

export interface WhatsAppDueFeesSendResult {
  class_name: string;
  academic_year: string;
  status: string;
  queued_count: number;
  skipped_count: number;
  total_due_sum: number;
}

export interface SmsSendResult {
  id: number;
  phone_number: string;
  message: string;
  status: string;
  sent_at: string | null;
}

export interface Student {
  id: number;
  admission_no: string;
  full_name: string;
  class_name: string;
  /** From roster. */
  section?: string;
  parent_phone: string;
  parent_name: string;
  /** ISO YYYY-MM-DD when set; used for dashboard birthdays. */
  date_of_birth?: string;
  /** Male / Female / M / F / empty → N/A in class summary charts. */
  gender?: string;
  /** Extended admission fields (JSON object from API). */
  admission_extras?: Record<string, unknown>;
  /** Portal login (managed on Portal passwords page). */
  login_enabled?: boolean;
  login_username?: string;
  has_login_password?: boolean;
}

export interface StudentPortalLoginPatch {
  login_enabled: boolean;
  login_username?: string;
  new_password?: string;
  clear_password?: boolean;
}

/** PATCH /students/{id}/self-profile (student JWT only). */
export interface StudentSelfProfilePatch {
  full_name?: string;
  parent_phone?: string;
  parent_name?: string;
  date_of_birth?: string;
  gender?: string;
  profile_photo_url?: string;
}

export type ListStudentsParams = {
  className?: string;
  /** Use `*` or omit to include every section (still pass to API only when narrowing). */
  section?: string;
  academicYear?: string;
  /** Matches name, admission no., parent phone, parent name, previous roll, father/mother mobile. */
  q?: string;
  skip?: number;
  limit?: number;
};

export interface StudentListPage {
  items: Student[];
  total: number;
  skip: number;
  limit: number;
}

export interface StudentLastAdmission {
  last_admission_no: string;
}

export interface StudentImportSuccessItem {
  row_number: number;
  admission_no: string;
  full_name: string;
  class_name: string;
}

export interface StudentImportFailureItem {
  row_number: number;
  admission_no: string;
  full_name: string;
  reason: string;
}

export interface StudentBulkImportResult {
  file_name: string;
  total_rows: number;
  success_count: number;
  failure_count: number;
  submitted: StudentImportSuccessItem[];
  failed: StudentImportFailureItem[];
}

export interface StudentReportDayMark {
  label: string;
  status: 'NOT_MARKED' | 'PRESENT' | 'ABSENT' | 'ON_LEAVE';
}

export interface StudentReportProfile {
  id: number;
  full_name: string;
  admission_no: string;
  class_name: string;
  section: string;
  parent_name: string;
  parent_phone: string;
  date_of_birth: string;
  date_of_admission: string | null;
  discount_fee_percent: number;
}

export interface StudentReportAttendance {
  presents_total: number;
  leaves_total: number;
  absents_total: number;
  presents_this_month: number;
  leaves_this_month: number;
  absents_this_month: number;
  overall_percent: number;
  month_percent: number;
  month_label: string;
  today: StudentReportDayMark;
  yesterday: StudentReportDayMark;
}

export interface StudentReportClassTestSubject {
  subject: string;
  total_tests: number;
  total_marks: number;
  obtained_marks: number;
  percent: number;
}

export interface StudentReportExamBlock {
  has_records: boolean;
  message: string;
}

export interface StudentReportFee {
  has_record: boolean;
  period_label: string;
  period_due: number;
  period_paid: number;
  balance: number;
  status: 'paid' | 'partially_paid' | 'unpaid' | 'none';
  academic_year: string;
}

export interface StudentPromotionLog {
  from_class: string;
  to_class: string;
  changed_at: string;
}

export interface StudentReport {
  profile: StudentReportProfile;
  attendance: StudentReportAttendance;
  class_tests: StudentReportClassTestSubject[];
  examinations: StudentReportExamBlock;
  fee: StudentReportFee;
  promotions: StudentPromotionLog[];
}

/** Student fee ledger row (class + academic year). */
export interface StudentFeeLedger {
  id: number;
  student_name: string;
  admission_no: string;
  class_name: string;
  academic_year: string;
  fee_plan_id: number | null;
  gross_total: number | null;
  discount_amount: number;
  total_due: number;
  total_paid: number;
  last_payment_date: string | null;
  remarks: string;
  recorded_at: string | null;
  section: string;
}

export interface FeeApplyStructureToClassBody {
  class_name: string;
  academic_year: string;
  replace_existing?: boolean;
  /** ISO date YYYY-MM-DD */
  consolidated_due_date?: string | null;
}

export interface FeeApplyStructureToClassResult {
  class_name: string;
  academic_year: string;
  per_student_gross: number;
  created: number;
  skipped: number;
  replaced: number;
  skipped_with_payments: number;
}

export interface FeeApplyPaymentBody {
  amount: number;
  additional_concession: number;
  paid_on?: string | null;
  note?: string;
}

export interface FeeApplyPaymentResult {
  student_fee: StudentFeeLedger;
  amount_applied: number;
  amount_unapplied: number;
}

export interface FeeConcessionUpdatePayload {
  discount_amount: number;
  note?: string;
  changed_on?: string | null;
}

export interface SchoolClassRow {
  id: number;
  name: string;
  sort_order: number;
  monthly_tuition?: string;
  class_teacher?: string;
  /** Section codes configured for this class (e.g. A, B). */
  sections?: string[];
}

export interface SchoolClassPayload {
  name: string;
  sort_order: number;
  monthly_tuition?: string;
  class_teacher?: string;
  /** Create only: optional list of section codes (server rejects duplicates). */
  initial_sections?: string[];
}

export interface SchoolClassSectionsPayload {
  section_codes: string[];
}

export interface ClassSubjectRow {
  id: number;
  subject_name: string;
  total_marks: string;
  sort_order: number;
}

export interface ClassSubjectsOverviewRow {
  class_id: number;
  class_name: string;
  subjects: ClassSubjectRow[];
}

export interface ClassSubjectPutRow {
  subject_name: string;
  total_marks?: string;
}

export interface ClassSubjectsPutPayload {
  rows: ClassSubjectPutRow[];
}

export interface SchoolAcademicYearRow {
  id: number;
  label: string;
  sort_order: number;
  is_current: boolean;
}

export interface SchoolFeeHeadRow {
  id: number;
  name: string;
  sort_order: number;
  prefix_amount: string;
  is_locked: boolean;
  particular_key?: string | null;
}

export interface SchoolFeeFrequencyRow {
  id: number;
  name: string;
  sort_order: number;
}

export interface FeeParticularRowRead {
  fee_head_id: number;
  particular_key?: string | null;
  label: string;
  amount_text: string;
  is_locked: boolean;
  readonly_amount: boolean;
  source: 'template' | 'class_structure' | 'student_override' | string;
}

export interface FeeParticularSheetRead {
  scope: 'class' | 'student';
  class_name?: string | null;
  student_id?: number | null;
  student_name?: string | null;
  admission_no?: string | null;
  academic_year: string;
  rows: FeeParticularRowRead[];
}

export interface FeeParticularRowWrite {
  particular_key: string;
  amount_text: string;
}

export interface FeeParticularSheetWrite {
  scope: 'class' | 'student';
  class_name?: string | null;
  student_id?: number | null;
  academic_year: string;
  rows: FeeParticularRowWrite[];
}

export interface FeeStructureRead {
  id: number;
  class_name: string;
  fee_head: string;
  amount: number;
  frequency: string;
  academic_year: string;
}

export interface FeeStructureCellIn {
  class_name: string;
  fee_head: string;
  amount: number;
  frequency?: string | null;
}

export interface FeeStructureBulkUpsert {
  academic_year: string;
  frequency?: string | null;
  cells: FeeStructureCellIn[];
}

export interface CurrentAcademicYear {
  academic_year: string;
  as_of_date: string;
}

export interface PTMUpdate {
  id: number;
  class_name: string;
  scheduled_at: string;
  venue: string;
  agenda: string;
  created_at: string;
}

export interface GalleryImage {
  id: number;
  title: string;
  event_name: string;
  image_url: string;
  taken_on: string | null;
  created_at: string;
}

export interface AttendanceRecord {
  id: number;
  student_name: string;
  admission_no: string;
  class_name: string;
  section: string;
  date: string;
  academic_year: string;
  present: boolean;
  remarks: string;
  application_received: boolean;
  application_notes: string;
}

export interface Homework {
  id: number;
  date: string;
  academic_year?: string;
  class: string;
  section?: string;
  teacher: string;
  subject: string;
  description: string;
  due_date?: string | null;
  marks?: string;
  attachment_name: string;
  created_at: string;
}

export interface HomeworkPayload {
  date: string;
  class: string;
  teacher: string;
  subject: string;
  description: string;
  due_date?: string | null;
  marks?: string;
  attachment_name?: string;
  academic_year?: string;
  section?: string;
}

export interface HomeworkFilters {
  date?: string;
  class?: string;
  teacher?: string;
}

export interface AttendanceListParams {
  className?: string;
  section?: string;
  onDate?: string;
  dateFrom?: string;
  dateTo?: string;
  yearMonth?: string;
  admissionNo?: string;
  academicYear?: string;
  status?: 'present' | 'absent';
}

export interface AttendanceDayStudentPayload {
  admission_no: string;
  student_name: string;
  section?: string;
  present: boolean;
  remarks?: string;
  application_received?: boolean;
  application_notes?: string;
}

export interface AttendanceUpsertDayPayload {
  class_name: string;
  date: string;
  academic_year?: string;
  rows: AttendanceDayStudentPayload[];
}

export interface SchoolHoliday {
  id: number;
  holiday_date: string;
  name: string;
  notes: string;
}

/** Matches backend: 0 = Sunday … 6 = Saturday (JavaScript getDay()). */
export interface SchoolHolidayWeeklyPayload {
  date_from: string;
  date_to: string;
  weekday: number;
  name: string;
  notes?: string;
  skip_if_date_has_holiday?: boolean;
}

export type FacultyPayload = Omit<Faculty, 'id'>;
export type StudentPayload = Omit<Student, 'id'>;
export type SchoolAcademicYearPayload = Omit<SchoolAcademicYearRow, 'id'>;
export type SchoolFeeHeadPayload = Omit<SchoolFeeHeadRow, 'id' | 'particular_key'>;
export type SchoolFeeFrequencyPayload = Omit<SchoolFeeFrequencyRow, 'id'>;
export type NoticePayload = Omit<Notice, 'id' | 'created_at'>;
export type PTMPayload = Omit<PTMUpdate, 'id' | 'created_at'>;
export type GalleryPayload = Omit<GalleryImage, 'id' | 'created_at'>;
export type AttendancePayload = Omit<AttendanceRecord, 'id'>;
export type SchoolHolidayPayload = Omit<SchoolHoliday, 'id'>;

export interface InstituteProfile {
  id: number;
  logo_data: string;
  name: string;
  tagline: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  country: string;
  /** ISO YYYY-MM-DD — shown on dashboard as annual establishment day. */
  established_on?: string;
  /** percentage | fixed_amount | none */
  discount_type?: string;
}

export type InstituteProfilePayload = Partial<Omit<InstituteProfile, 'id'>>;

export interface DashboardIncomeMonth {
  year_month: string;
  income: number;
  expenses: number;
}

export interface DashboardFeeSummary {
  estimation_total: number;
  collected_total: number;
  remaining_total: number;
  collected_this_month: number;
}

export interface DashboardStudentAttendance {
  marked: boolean;
  present_pct: number;
  absent_count: number;
  present_count: number;
  total_marked: number;
}

export interface DashboardEmployeeAttendance {
  marked: boolean;
  present_pct: number;
}

export interface DashboardNewAdmission {
  admission_no: string;
  full_name: string;
  class_name: string;
}

export interface DashboardAbsentStudent {
  admission_no: string;
  full_name: string;
  class_name: string;
}

export interface DashboardSummary {
  as_of_date: string;
  income_by_month: DashboardIncomeMonth[];
  fee: DashboardFeeSummary;
  student_attendance: DashboardStudentAttendance;
  employee_attendance: DashboardEmployeeAttendance;
  fee_collection_month_pct: number;
  new_admissions: DashboardNewAdmission[];
  absent_students_today: DashboardAbsentStudent[];
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  private readonly homeworkApi = `${API_ORIGIN}/homeworks`;

  private authHeaders(): { headers: HttpHeaders } {
    const t = this.session.token();
    return {
      headers: new HttpHeaders(t ? { Authorization: `Bearer ${t}` } : {}),
    };
  }

  getDashboardSummary(): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${API}/dashboard/summary`);
  }

  health(): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${API}/health`);
  }

  login(body: AuthLoginRequest): Observable<AuthLoginResponse> {
    return this.http.post<AuthLoginResponse>(`${API}/auth/login`, body);
  }

  me(token: string): Observable<AuthMeResponse> {
    return this.http.get<AuthMeResponse>(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  getHomeworks(filters?: HomeworkFilters): Observable<Homework[]> {
    let p = new HttpParams();
    if (filters?.date) p = p.set('date', filters.date);
    if (filters?.class) p = p.set('class', filters.class);
    if (filters?.teacher) p = p.set('teacher', filters.teacher);
    return this.http.get<Homework[]>(this.homeworkApi, {
      ...this.authHeaders(),
      params: p,
    });
  }

  addHomework(body: HomeworkPayload): Observable<Homework> {
    return this.http.post<Homework>(this.homeworkApi, body, this.authHeaders());
  }

  deleteHomework(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(
      `${this.homeworkApi}/${id}`,
      this.authHeaders()
    );
  }

  updateHomework(id: number, data: HomeworkPayload): Observable<Homework> {
    return this.http.put<Homework>(
      `${this.homeworkApi}/${id}`,
      data,
      this.authHeaders()
    );
  }

  getFaculty(id: number): Observable<Faculty> {
    return this.http.get<Faculty>(`${API}/faculty/${id}`);
  }

  listFaculty(params?: { q?: string; skip?: number; limit?: number }): Observable<Faculty[]> {
    let p = new HttpParams();
    const qv = (params?.q || '').trim();
    if (qv) p = p.set('q', qv);
    if (params?.skip != null) p = p.set('skip', String(params.skip));
    if (params?.limit != null) p = p.set('limit', String(params.limit));
    return this.http.get<Faculty[]>(`${API}/faculty`, { params: p });
  }

  createFaculty(body: FacultyPayload): Observable<Faculty> {
    return this.http.post<Faculty>(`${API}/faculty`, body);
  }

  updateFaculty(id: number, body: FacultyPayload): Observable<Faculty> {
    return this.http.put<Faculty>(`${API}/faculty/${id}`, body);
  }

  deleteFaculty(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API}/faculty/${id}`);
  }

  patchFacultyPortalLogin(
    id: number,
    body: FacultyPortalLoginPatch
  ): Observable<Faculty> {
    return this.http.patch<Faculty>(`${API}/faculty/${id}/portal-login`, body);
  }

  getCurrentAcademicYear(): Observable<CurrentAcademicYear> {
    return this.http.get<CurrentAcademicYear>(`${API}/school/current-academic-year`);
  }

  /**
   * List students. Pass a string for backward compatibility (same as `{ className: s }`).
   * Use `academic_year` + `class_name` (+ optional `section`, `q`) for filtered lists.
   */
  listStudents(
    params?: ListStudentsParams | string
  ): Observable<Student[]> {
    let opts: ListStudentsParams = {};
    if (typeof params === 'string') {
      const c = params.trim();
      if (c) opts = { className: c };
    } else if (params) {
      opts = params;
    }
    let p = new HttpParams();
    const cn = (opts.className || '').trim();
    if (cn) p = p.set('class_name', cn);
    const sec = (opts.section || '').trim();
    if (sec && sec !== '*') p = p.set('section', sec);
    const ay = (opts.academicYear || '').trim();
    if (ay) p = p.set('academic_year', ay);
    const qv = (opts.q || '').trim();
    if (qv) p = p.set('q', qv);
    if (opts.skip != null && opts.skip > 0) p = p.set('skip', String(opts.skip));
    if (opts.limit != null) p = p.set('limit', String(opts.limit));
    return this.http.get<Student[]>(`${API}/students`, { params: p });
  }

  /** Paged roster with total count (All students screen). */
  listStudentsPage(params: ListStudentsParams): Observable<StudentListPage> {
    const opts = params || {};
    let p = new HttpParams();
    const cn = (opts.className || '').trim();
    if (cn) p = p.set('class_name', cn);
    const sec = (opts.section || '').trim();
    if (sec && sec !== '*') p = p.set('section', sec);
    const ay = (opts.academicYear || '').trim();
    if (ay) p = p.set('academic_year', ay);
    const qv = (opts.q || '').trim();
    if (qv) p = p.set('q', qv);
    const skip = opts.skip ?? 0;
    const limit = opts.limit ?? 25;
    p = p.set('skip', String(skip));
    p = p.set('limit', String(limit));
    return this.http.get<StudentListPage>(`${API}/students/page`, { params: p });
  }

  /** Paged list for Student login admin (search + accurate total). */
  listStudentsPortalPage(params: {
    q?: string;
    skip: number;
    limit: number;
  }): Observable<StudentListPage> {
    let p = new HttpParams()
      .set('skip', String(params.skip))
      .set('limit', String(params.limit));
    const qv = (params.q || '').trim();
    if (qv) p = p.set('q', qv);
    return this.http.get<StudentListPage>(`${API}/students/portal-login/page`, {
      params: p,
    });
  }

  getStudent(id: number): Observable<Student> {
    return this.http.get<Student>(`${API}/students/${id}`);
  }

  getLastAdmissionNumber(): Observable<StudentLastAdmission> {
    return this.http.get<StudentLastAdmission>(`${API}/students/last-admission`);
  }

  getStudentImportTemplate(
    format: 'csv' | 'xlsx',
  ): Observable<Blob> {
    return this.http.get(`${API}/students/import-template`, {
      params: { format },
      responseType: 'blob',
    });
  }

  bulkImportStudents(file: File): Observable<StudentBulkImportResult> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<StudentBulkImportResult>(`${API}/students/import`, fd);
  }

  createStudent(body: StudentPayload): Observable<Student> {
    return this.http.post<Student>(`${API}/students`, body);
  }

  updateStudent(id: number, body: StudentPayload): Observable<Student> {
    return this.http.put<Student>(`${API}/students/${id}`, body);
  }

  patchStudentPortalLogin(
    id: number,
    body: StudentPortalLoginPatch
  ): Observable<Student> {
    return this.http.patch<Student>(`${API}/students/${id}/portal-login`, body);
  }

  patchStudentSelfProfile(
    id: number,
    body: StudentSelfProfilePatch
  ): Observable<Student> {
    return this.http.patch<Student>(
      `${API}/students/${id}/self-profile`,
      body,
      this.authHeaders()
    );
  }

  deleteStudent(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API}/students/${id}`);
  }

  getStudentReport(studentId: number): Observable<StudentReport> {
    return this.http.get<StudentReport>(`${API}/students/${studentId}/report`);
  }

  listSchoolClasses(): Observable<SchoolClassRow[]> {
    return this.http.get<SchoolClassRow[]>(`${API}/school/classes`);
  }

  createSchoolClass(body: SchoolClassPayload): Observable<SchoolClassRow> {
    return this.http.post<SchoolClassRow>(`${API}/school/classes`, body);
  }

  updateSchoolClass(
    id: number,
    body: SchoolClassPayload
  ): Observable<SchoolClassRow> {
    return this.http.put<SchoolClassRow>(`${API}/school/classes/${id}`, body);
  }

  putSchoolClassSections(
    classId: number,
    body: SchoolClassSectionsPayload
  ): Observable<SchoolClassRow> {
    return this.http.put<SchoolClassRow>(
      `${API}/school/classes/${classId}/sections`,
      body
    );
  }

  deleteSchoolClass(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API}/school/classes/${id}`);
  }

  /** `class_ids`: every class id exactly once, in desired order. */
  reorderSchoolClasses(classIds: number[]): Observable<SchoolClassRow[]> {
    return this.http.put<SchoolClassRow[]>(`${API}/school/classes/reorder`, {
      class_ids: classIds,
    });
  }

  listSubjectsByClassOverview(): Observable<ClassSubjectsOverviewRow[]> {
    return this.http.get<ClassSubjectsOverviewRow[]>(`${API}/school/subjects/by-class`);
  }

  listClassSubjects(classId: number): Observable<ClassSubjectRow[]> {
    return this.http.get<ClassSubjectRow[]>(`${API}/school/classes/${classId}/subjects`);
  }

  putClassSubjects(
    classId: number,
    body: ClassSubjectsPutPayload
  ): Observable<ClassSubjectRow[]> {
    return this.http.put<ClassSubjectRow[]>(
      `${API}/school/classes/${classId}/subjects`,
      body
    );
  }

  listSchoolAcademicYears(): Observable<SchoolAcademicYearRow[]> {
    return this.http.get<SchoolAcademicYearRow[]>(`${API}/school/academic-years`);
  }

  createSchoolAcademicYear(
    body: SchoolAcademicYearPayload
  ): Observable<SchoolAcademicYearRow> {
    return this.http.post<SchoolAcademicYearRow>(
      `${API}/school/academic-years`,
      body
    );
  }

  updateSchoolAcademicYear(
    id: number,
    body: SchoolAcademicYearPayload
  ): Observable<SchoolAcademicYearRow> {
    return this.http.put<SchoolAcademicYearRow>(
      `${API}/school/academic-years/${id}`,
      body
    );
  }

  deleteSchoolAcademicYear(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API}/school/academic-years/${id}`);
  }

  listSchoolFeeHeads(): Observable<SchoolFeeHeadRow[]> {
    return this.http.get<SchoolFeeHeadRow[]>(`${API}/school/fee-heads`);
  }

  listFeeParticulars(): Observable<SchoolFeeHeadRow[]> {
    return this.http.get<SchoolFeeHeadRow[]>(`${API}/school/fee-particulars`);
  }

  getFeeParticularsSheet(params: {
    scope: 'class' | 'student';
    className?: string;
    studentId?: number;
    academicYear?: string;
  }): Observable<FeeParticularSheetRead> {
    let p = new HttpParams().set('scope', params.scope);
    if (params.className) p = p.set('class_name', params.className);
    if (params.studentId != null && params.studentId > 0) {
      p = p.set('student_id', String(params.studentId));
    }
    if (params.academicYear) p = p.set('academic_year', params.academicYear);
    return this.http.get<FeeParticularSheetRead>(`${API}/school/fee-particulars-sheet`, {
      params: p,
    });
  }

  saveFeeParticularsSheet(body: FeeParticularSheetWrite): Observable<FeeParticularSheetRead> {
    return this.http.put<FeeParticularSheetRead>(`${API}/school/fee-particulars-sheet`, body);
  }

  listFeeStructure(academicYear?: string): Observable<FeeStructureRead[]> {
    let p = new HttpParams();
    if (academicYear) p = p.set('academic_year', academicYear);
    return this.http.get<FeeStructureRead[]>(`${API}/school/fee-structure`, { params: p });
  }

  saveFeeStructureBulk(body: FeeStructureBulkUpsert): Observable<FeeStructureRead[]> {
    return this.http.put<FeeStructureRead[]>(`${API}/school/fee-structure`, body);
  }

  createSchoolFeeHead(body: SchoolFeeHeadPayload): Observable<SchoolFeeHeadRow> {
    return this.http.post<SchoolFeeHeadRow>(`${API}/school/fee-heads`, body);
  }

  updateSchoolFeeHead(
    id: number,
    body: SchoolFeeHeadPayload
  ): Observable<SchoolFeeHeadRow> {
    return this.http.put<SchoolFeeHeadRow>(`${API}/school/fee-heads/${id}`, body);
  }

  deleteSchoolFeeHead(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API}/school/fee-heads/${id}`);
  }

  listSchoolFeeFrequencies(): Observable<SchoolFeeFrequencyRow[]> {
    return this.http.get<SchoolFeeFrequencyRow[]>(`${API}/school/fee-frequencies`);
  }

  createSchoolFeeFrequency(
    body: SchoolFeeFrequencyPayload
  ): Observable<SchoolFeeFrequencyRow> {
    return this.http.post<SchoolFeeFrequencyRow>(
      `${API}/school/fee-frequencies`,
      body
    );
  }

  updateSchoolFeeFrequency(
    id: number,
    body: SchoolFeeFrequencyPayload
  ): Observable<SchoolFeeFrequencyRow> {
    return this.http.put<SchoolFeeFrequencyRow>(
      `${API}/school/fee-frequencies/${id}`,
      body
    );
  }

  deleteSchoolFeeFrequency(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(
      `${API}/school/fee-frequencies/${id}`
    );
  }

  listNotices(): Observable<Notice[]> {
    return this.http.get<Notice[]>(`${API}/notices`);
  }

  createNotice(body: NoticePayload): Observable<Notice> {
    return this.http.post<Notice>(`${API}/notices`, body);
  }

  updateNotice(id: number, body: NoticePayload): Observable<Notice> {
    return this.http.put<Notice>(`${API}/notices/${id}`, body);
  }

  deleteNotice(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API}/notices/${id}`);
  }

  listWhatsApp(className?: string): Observable<WhatsAppBroadcast[]> {
    let p = new HttpParams();
    if (className) p = p.set('class_name', className);
    return this.http.get<WhatsAppBroadcast[]>(`${API}/whatsapp/broadcasts`, {
      params: p,
    });
  }

  postWhatsApp(body: { class_name: string; message: string }): Observable<WhatsAppBroadcast> {
    return this.http.post<WhatsAppBroadcast>(`${API}/whatsapp/broadcasts`, body);
  }

  postWhatsAppGroup(body: { class_name: string; message: string }): Observable<WhatsAppGroupSendResult> {
    return this.http.post<WhatsAppGroupSendResult>(`${API}/whatsapp/broadcasts/group`, body);
  }

  postWhatsAppDueFees(body: {
    class_name: string;
    academic_year: string;
    message_template?: string;
  }): Observable<WhatsAppDueFeesSendResult> {
    return this.http.post<WhatsAppDueFeesSendResult>(`${API}/whatsapp/broadcasts/due-fees`, body);
  }

  postSms(body: { phone_number: string; message: string }): Observable<SmsSendResult> {
    return this.http.post<SmsSendResult>(`${API}/whatsapp/sms/send`, body);
  }

  deleteWhatsAppBroadcast(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API}/whatsapp/broadcasts/${id}`);
  }

  listPTM(className?: string): Observable<PTMUpdate[]> {
    let p = new HttpParams();
    if (className) p = p.set('class_name', className);
    return this.http.get<PTMUpdate[]>(`${API}/ptm`, { params: p });
  }

  createPTM(body: PTMPayload): Observable<PTMUpdate> {
    return this.http.post<PTMUpdate>(`${API}/ptm`, body);
  }

  updatePTM(id: number, body: PTMPayload): Observable<PTMUpdate> {
    return this.http.put<PTMUpdate>(`${API}/ptm/${id}`, body);
  }

  deletePTM(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API}/ptm/${id}`);
  }

  listGallery(): Observable<GalleryImage[]> {
    return this.http.get<GalleryImage[]>(`${API}/gallery`);
  }

  createGalleryImage(body: GalleryPayload): Observable<GalleryImage> {
    return this.http.post<GalleryImage>(`${API}/gallery`, body);
  }

  updateGalleryImage(id: number, body: GalleryPayload): Observable<GalleryImage> {
    return this.http.put<GalleryImage>(`${API}/gallery/${id}`, body);
  }

  deleteGalleryImage(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${API}/gallery/${id}`);
  }

  listAttendance(params?: AttendanceListParams): Observable<AttendanceRecord[]> {
    let p = new HttpParams();
    if (params) {
      if (params.className) p = p.set('class_name', params.className);
      if (params.section) p = p.set('section', params.section);
      if (params.onDate) p = p.set('on_date', params.onDate);
      if (params.dateFrom) p = p.set('date_from', params.dateFrom);
      if (params.dateTo) p = p.set('date_to', params.dateTo);
      if (params.yearMonth) p = p.set('year_month', params.yearMonth);
      if (params.admissionNo) p = p.set('admission_no', params.admissionNo);
      if (params.academicYear) p = p.set('academic_year', params.academicYear);
      if (params.status) p = p.set('status', params.status);
    }
    return this.http.get<AttendanceRecord[]>(`${API}/attendance`, {
      ...this.authHeaders(),
      params: p,
    });
  }

  upsertAttendanceDay(
    body: AttendanceUpsertDayPayload
  ): Observable<AttendanceRecord[]> {
    return this.http.post<AttendanceRecord[]>(
      `${API}/attendance/upsert-day`,
      body,
      this.authHeaders()
    );
  }

  createAttendance(body: AttendancePayload): Observable<AttendanceRecord> {
    return this.http.post<AttendanceRecord>(
      `${API}/attendance`,
      body,
      this.authHeaders()
    );
  }

  updateAttendance(
    id: number,
    body: AttendancePayload
  ): Observable<AttendanceRecord> {
    return this.http.put<AttendanceRecord>(
      `${API}/attendance/${id}`,
      body,
      this.authHeaders()
    );
  }

  deleteAttendance(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(
      `${API}/attendance/${id}`,
      this.authHeaders()
    );
  }

  listHolidays(dateFrom?: string, dateTo?: string): Observable<SchoolHoliday[]> {
    let p = new HttpParams();
    if (dateFrom) p = p.set('date_from', dateFrom);
    if (dateTo) p = p.set('date_to', dateTo);
    return this.http.get<SchoolHoliday[]>(`${API}/holidays`, { params: p });
  }

  listHolidaysInMonth(yearMonth: string): Observable<SchoolHoliday[]> {
    const p = new HttpParams().set('year_month', yearMonth);
    return this.http.get<SchoolHoliday[]>(`${API}/holidays/in-month`, { params: p });
  }

  createHoliday(body: SchoolHolidayPayload): Observable<SchoolHoliday> {
    return this.http.post<SchoolHoliday>(`${API}/holidays`, body, this.authHeaders());
  }

  generateWeeklyHolidays(
    body: SchoolHolidayWeeklyPayload
  ): Observable<SchoolHoliday[]> {
    return this.http.post<SchoolHoliday[]>(
      `${API}/holidays/generate-weekly`,
      body,
      this.authHeaders()
    );
  }

  updateHoliday(
    id: number,
    body: SchoolHolidayPayload
  ): Observable<SchoolHoliday> {
    return this.http.put<SchoolHoliday>(
      `${API}/holidays/${id}`,
      body,
      this.authHeaders()
    );
  }

  deleteHoliday(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(
      `${API}/holidays/${id}`,
      this.authHeaders()
    );
  }

  getInstituteProfile(): Observable<InstituteProfile> {
    return this.http.get<InstituteProfile>(`${API}/institute-profile`);
  }

  updateInstituteProfile(
    body: InstituteProfilePayload
  ): Observable<InstituteProfile> {
    return this.http.put<InstituteProfile>(`${API}/institute-profile`, body);
  }

  listStudentFees(params: {
    className: string;
    academicYear: string;
  }): Observable<StudentFeeLedger[]> {
    const p = new HttpParams()
      .set('class_name', params.className)
      .set('academic_year', params.academicYear);
    return this.http.get<StudentFeeLedger[]>(`${API}/fees/student-fees`, { params: p });
  }

  applyFeeStructureToClass(
    body: FeeApplyStructureToClassBody
  ): Observable<FeeApplyStructureToClassResult> {
    return this.http.post<FeeApplyStructureToClassResult>(
      `${API}/fees/apply-structure-to-class`,
      body
    );
  }

  updateStudentFeeConcession(
    studentFeeId: number,
    body: FeeConcessionUpdatePayload
  ): Observable<StudentFeeLedger> {
    return this.http.put<StudentFeeLedger>(
      `${API}/fees/student-fees/${studentFeeId}/concession`,
      body
    );
  }

  applyStudentFeePayment(
    studentFeeId: number,
    body: FeeApplyPaymentBody
  ): Observable<FeeApplyPaymentResult> {
    return this.http.post<FeeApplyPaymentResult>(
      `${API}/fees/student-fees/${studentFeeId}/payment`,
      body
    );
  }
}
