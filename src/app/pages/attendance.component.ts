import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import {
  ApiService,
  AttendanceListParams,
  AttendanceRecord,
  AttendancePayload,
  SchoolHoliday,
  SchoolHolidayPayload,
  Student,
} from '../core/api.service';
import { indiaAcademicYearLabel } from '../core/academic-year.util';
import { SchoolRefService } from '../core/school-ref.service';
import { SECTION_LETTERS } from '../core/section-options';

export type AttendanceView =
  | 'class_bulk'
  | 'student_year'
  | 'register'
  | 'calendar'
  | 'holidays';

export interface BulkRow {
  admission_no: string;
  student_name: string;
  section: string;
  present: boolean;
  remarks: string;
  application_received: boolean;
  application_notes: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** YYYY-MM-DD from API (handles "2026-04-04" and ISO datetimes). */
function normalizeAttendanceDateKey(raw: unknown): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : '';
}

function parseISODateParts(s: string): { y: number; m: number; d: number } | null {
  const key = normalizeAttendanceDateKey(s);
  if (!key) return null;
  const p = key.split('-').map((x) => parseInt(x, 10));
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return null;
  return { y: p[0], m: p[1], d: p[2] };
}

function attendanceIsPresent(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    return t === 'true' || t === '1';
  }
  return Boolean(v);
}

/** Months from (minY,minM) through (maxY,maxM) inclusive, at most maxMonths. */
function enumerateMonthsUpTo(
  minY: number,
  minM: number,
  maxY: number,
  maxM: number,
  maxMonths: number
): { y: number; m: number }[] {
  const out: { y: number; m: number }[] = [];
  let cy = minY;
  let cm = minM;
  for (let i = 0; i < maxMonths; i++) {
    if (cy > maxY || (cy === maxY && cm > maxM)) break;
    out.push({ y: cy, m: cm });
    cm++;
    if (cm > 12) {
      cm = 1;
      cy++;
    }
  }
  return out;
}

/**
 * School labels like "2025-26" → 1 Apr 2025 through 31 Mar 2000+26 (inclusive).
 */
function parseAcademicYearRange(
  label: string
): { from: string; to: string; yStart: number } | null {
  const t = label.trim();
  const m = /^(\d{4})-(\d{2})$/.exec(t);
  if (!m) return null;
  const y1 = parseInt(m[1], 10);
  const y2s = parseInt(m[2], 10);
  if (Number.isNaN(y1) || Number.isNaN(y2s)) return null;
  const y2 = y2s < 100 ? 2000 + y2s : y2s;
  if (y2 < y1) return null;
  return {
    from: `${y1}-04-01`,
    to: `${y2}-03-31`,
    yStart: y1,
  };
}

export interface StudentYearDayCell {
  day: number | null;
  iso: string | null;
  mark: 'P' | 'A' | '';
  tooltip: string;
  isHoliday: boolean;
}

export type StudentYearWeekRow = StudentYearDayCell[];

export interface StudentYearMonthGrid {
  title: string;
  weeks: StudentYearWeekRow[];
}

function buildSingleMonthGrid(
  cy: number,
  cm: number,
  byDate: Map<string, AttendanceRecord>,
  holidayByDate: Map<string, string>
): StudentYearMonthGrid {
  const title = new Date(cy, cm - 1, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const dim = daysInMonth(cy, cm);
  const firstWd = new Date(cy, cm - 1, 1).getDay();
  const cells: StudentYearDayCell[] = [];
  for (let p = 0; p < firstWd; p++) {
    cells.push({
      day: null,
      iso: null,
      mark: '',
      tooltip: '',
      isHoliday: false,
    });
  }
  for (let d = 1; d <= dim; d++) {
    const iso = `${cy}-${pad2(cm)}-${pad2(d)}`;
    const rec = byDate.get(iso);
    const ho = holidayByDate.get(iso);
    const mark: 'P' | 'A' | '' = rec
      ? attendanceIsPresent(rec.present)
        ? 'P'
        : 'A'
      : '';
    const parts: string[] = [];
    if (ho) parts.push(`Holiday: ${ho}`);
    if (rec) {
      parts.push(attendanceIsPresent(rec.present) ? 'Present' : 'Absent');
      if (rec.class_name) parts.push(`Class ${rec.class_name}`);
      if (rec.remarks) parts.push(`Remarks: ${rec.remarks}`);
      if (rec.application_received) {
        parts.push(
          `Application: ${rec.application_notes?.trim() || 'received'}`
        );
      }
    }
    if (!parts.length) parts.push(iso);
    cells.push({
      day: d,
      iso,
      mark,
      tooltip: parts.join(' · '),
      isHoliday: !!ho,
    });
  }
  const padEnd = (7 - (cells.length % 7)) % 7;
  for (let p = 0; p < padEnd; p++) {
    cells.push({
      day: null,
      iso: null,
      mark: '',
      tooltip: '',
      isHoliday: false,
    });
  }
  const weeks: StudentYearWeekRow[] = [];
  for (let s = 0; s < cells.length; s += 7) {
    weeks.push(cells.slice(s, s + 7) as StudentYearWeekRow);
  }
  return { title, weeks };
}

function buildStudentYearMonthGridsFromMonths(
  months: { y: number; m: number }[],
  byDate: Map<string, AttendanceRecord>,
  holidayByDate: Map<string, string>
): StudentYearMonthGrid[] {
  return months.map(({ y, m }) =>
    buildSingleMonthGrid(y, m, byDate, holidayByDate)
  );
}

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './attendance.component.html',
  styleUrl: './attendance.component.scss',
})
export class AttendanceComponent {
  private readonly api = inject(ApiService);
  readonly schoolRef = inject(SchoolRefService);

  readonly sectionLetters = SECTION_LETTERS;

  view: AttendanceView = 'class_bulk';

  /** All students (roster picker, student-year tab). */
  allStudents = signal<Student[]>([]);

  // --- Class bulk ---
  bulkClass = '';
  bulkSection = '';
  bulkDate = todayISO();
  bulkYear = '';
  bulkRows: BulkRow[] = [];
  bulkBusy = false;
  bulkErr = '';
  bulkLoaded = false;

  // --- Student × academic year ---
  syAdmission = '';
  syYear = '';
  syRows = signal<AttendanceRecord[]>([]);
  syMonthGrids: StudentYearMonthGrid[] = [];
  /** Human range e.g. April 1, 2025 – March 31, 2026 */
  syRangeHuman = '';
  readonly syWeekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  syBusy = false;
  syErr = '';

  // --- Register / filters ---
  regClass = '';
  regSection = '';
  regMonth = currentYearMonth();
  regStatus: '' | 'present' | 'absent' = '';
  regAdmission = '';
  regRows = signal<AttendanceRecord[]>([]);
  regBusy = false;
  regErr = '';

  // --- Quick single record (register tab) ---
  student_name = '';
  admission_no = '';
  class_name = '';
  section = '';
  record_date = '';
  academic_year = '';
  present = true;
  remarks = '';
  application_received = false;
  application_notes = '';
  editingId: number | null = null;
  saving = false;
  pickAdmissionNo = '';
  formErr = '';

  // --- Calendar matrix ---
  calMonth = currentYearMonth();
  calClass = '';
  calSection = '';
  calDays: number[] = [];
  calStudents: Student[] = [];
  /** admission_no -> day(1-based) -> 'P' | 'A' */
  calCellMap = new Map<string, Map<number, 'P' | 'A'>>();
  calHolidayDays = new Set<number>();
  calBusy = false;
  calErr = '';

  // --- Holidays CRUD ---
  holidaysList = signal<SchoolHoliday[]>([]);
  holDate = '';
  holName = '';
  holNotes = '';
  holBusy = false;
  holErr = '';
  editingHolId: number | null = null;

  /** 0 = Sunday … 6 = Saturday (same as JavaScript Date.getDay()). */
  readonly holWeekdayOptions: { v: number; label: string }[] = [
    { v: 0, label: 'Sunday' },
    { v: 1, label: 'Monday' },
    { v: 2, label: 'Tuesday' },
    { v: 3, label: 'Wednesday' },
    { v: 4, label: 'Thursday' },
    { v: 5, label: 'Friday' },
    { v: 6, label: 'Saturday' },
  ];
  holWeeklyFrom = '';
  holWeeklyTo = '';
  holWeeklyWeekday = 0;
  holWeeklyName = 'Sunday (weekly off)';
  holWeeklyNotes = '';
  /** Skip dates that already have any holiday (avoids duplicates). */
  holWeeklySkipIfBusy = true;
  holGenMsg = '';

  constructor() {
    this.api
      .listStudents()
      .pipe(catchError(() => of<Student[]>([])))
      .subscribe((list) => this.allStudents.set(list));
    this.schoolRef.afterDefaultAcademicYearLoaded().subscribe((y) => {
      if (!this.bulkYear) this.bulkYear = y;
      if (!this.academic_year) this.academic_year = y;
      if (!this.syYear) this.syYear = y;
    });
    if (!this.record_date) this.record_date = todayISO();
    if (!this.holDate) this.holDate = todayISO();
  }

  private defaultYear(): string {
    return this.schoolRef.defaultAcademicYear() || indiaAcademicYearLabel();
  }

  onBulkClassChange(): void {
    this.bulkLoaded = false;
    this.bulkRows = [];
    if (this.bulkClass) this.schoolRef.ensureStudentsForClass(this.bulkClass);
  }

  loadBulkSheet(): void {
    this.bulkErr = '';
    if (!this.bulkClass.trim() || !this.bulkDate) {
      this.bulkErr = 'Choose class and date.';
      return;
    }
    if (!this.bulkYear.trim()) this.bulkYear = this.defaultYear();
    this.schoolRef.ensureStudentsForClass(this.bulkClass);
    this.bulkBusy = true;
    this.bulkLoaded = false;
    const sec = this.bulkSection.trim();
    forkJoin({
      roster: this.api
        .listStudents(this.bulkClass.trim())
        .pipe(catchError(() => of<Student[]>([]))),
      existing: this.api
        .listAttendance({
          className: this.bulkClass.trim(),
          onDate: this.bulkDate,
        })
        .pipe(catchError(() => of<AttendanceRecord[]>([]))),
    }).subscribe({
      next: ({ roster, existing }) => {
        const list = sec
          ? roster.filter((s) => (s.section || '').trim() === sec)
          : roster;
        list.sort((a, b) => a.full_name.localeCompare(b.full_name));
        const byAdm = new Map(
          existing.map((r) => [r.admission_no.trim(), r])
        );
        this.bulkRows = list.map((s) => {
          const e = byAdm.get(s.admission_no.trim());
          return {
            admission_no: s.admission_no,
            student_name: s.full_name,
            section: (s.section || '').trim(),
            present: e ? e.present : true,
            remarks: e?.remarks ?? '',
            application_received: e?.application_received ?? false,
            application_notes: e?.application_notes ?? '',
          };
        });
        this.bulkBusy = false;
        this.bulkLoaded = true;
      },
      error: () => {
        this.bulkBusy = false;
        this.bulkErr = 'Could not load attendance for that date.';
      },
    });
  }

  setBulkAllPresent(v: boolean): void {
    for (const r of this.bulkRows) r.present = v;
  }

  saveBulkSheet(): void {
    this.bulkErr = '';
    if (!this.bulkClass.trim() || !this.bulkDate || !this.bulkRows.length) {
      this.bulkErr = 'Load the class sheet first.';
      return;
    }
    if (!this.bulkYear.trim()) this.bulkYear = this.defaultYear();
    this.bulkBusy = true;
    this.api
      .upsertAttendanceDay({
        class_name: this.bulkClass.trim(),
        date: this.bulkDate,
        academic_year: this.bulkYear.trim(),
        rows: this.bulkRows.map((r) => ({
          admission_no: r.admission_no,
          student_name: r.student_name,
          section: r.section,
          present: r.present,
          remarks: r.remarks,
          application_received: r.application_received,
          application_notes: r.application_notes,
        })),
      })
      .subscribe({
        next: () => {
          this.bulkBusy = false;
        },
        error: () => {
          this.bulkBusy = false;
          this.bulkErr = 'Save failed.';
        },
      });
  }

  loadStudentYear(): void {
    this.syErr = '';
    this.syMonthGrids = [];
    this.syRangeHuman = '';
    const adm = this.syAdmission.trim();
    const y = this.syYear.trim();
    if (!adm || !y) {
      this.syErr = 'Select student and academic year.';
      return;
    }
    const range = parseAcademicYearRange(y);
    if (!range) {
      this.syErr =
        'Academic year must look like 2025-26 (session April–March of the next year).';
      return;
    }
    this.syBusy = true;
    const yLabel = y.trim();
    forkJoin({
      byLabel: this.api
        .listAttendance({ admissionNo: adm, academicYear: yLabel })
        .pipe(catchError(() => of<AttendanceRecord[]>([]))),
      byRange: this.api
        .listAttendance({
          admissionNo: adm,
          dateFrom: range.from,
          dateTo: range.to,
        })
        .pipe(catchError(() => of<AttendanceRecord[]>([]))),
    })
      .pipe(
        switchMap(({ byLabel, byRange }) => {
          const merged = new Map<number, AttendanceRecord>();
          for (const r of byLabel) merged.set(r.id, r);
          for (const r of byRange) merged.set(r.id, r);
          const rows = [...merged.values()];

          let holFrom = range.from;
          let holTo = range.to;
          for (const r of rows) {
            const k = normalizeAttendanceDateKey(r.date);
            if (!k) continue;
            if (k < holFrom) holFrom = k;
            if (k > holTo) holTo = k;
          }

          return forkJoin({
            rows: of(rows),
            hols: this.api
              .listHolidays(holFrom, holTo)
              .pipe(catchError(() => of<SchoolHoliday[]>([]))),
          });
        })
      )
      .subscribe({
        next: ({ rows, hols }) => {
          this.syRows.set(rows);
          const byDate = new Map<string, AttendanceRecord>();
          for (const r of rows) {
            const k = normalizeAttendanceDateKey(r.date);
            if (k) byDate.set(k, r);
          }
          const holidayByDate = new Map<string, string>();
          for (const h of hols) {
            const hk = normalizeAttendanceDateKey(h.holiday_date);
            if (hk) holidayByDate.set(hk, h.name);
          }

          const sp = parseISODateParts(range.from);
          const ep = parseISODateParts(range.to);
          if (!sp || !ep) {
            this.syMonthGrids = [];
            this.syBusy = false;
            return;
          }
          let minY = sp.y;
          let minM = sp.m;
          let maxY = ep.y;
          let maxM = ep.m;
          for (const r of rows) {
            const p = parseISODateParts(normalizeAttendanceDateKey(r.date));
            if (!p) continue;
            if (p.y < minY || (p.y === minY && p.m < minM)) {
              minY = p.y;
              minM = p.m;
            }
            if (p.y > maxY || (p.y === maxY && p.m > maxM)) {
              maxY = p.y;
              maxM = p.m;
            }
          }
          const months = enumerateMonthsUpTo(minY, minM, maxY, maxM, 24);
          this.syMonthGrids = buildStudentYearMonthGridsFromMonths(
            months,
            byDate,
            holidayByDate
          );

          const fromD = new Date(`${range.from}T12:00:00`);
          const toD = new Date(`${range.to}T12:00:00`);
          this.syRangeHuman = `${fromD.toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })} – ${toD.toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}`;
          this.syBusy = false;
        },
        error: () => {
          this.syBusy = false;
          this.syErr = 'Load failed.';
        },
      });
  }

  loadRegister(): void {
    this.regErr = '';
    const p: AttendanceListParams = {};
    if (this.regClass.trim()) p.className = this.regClass.trim();
    if (this.regSection.trim()) p.section = this.regSection.trim();
    if (this.regMonth.trim()) p.yearMonth = this.regMonth.trim();
    if (this.regAdmission.trim()) p.admissionNo = this.regAdmission.trim();
    if (this.regStatus) p.status = this.regStatus;
    this.regBusy = true;
    this.api
      .listAttendance(p)
      .pipe(catchError(() => of<AttendanceRecord[]>([])))
      .subscribe({
        next: (rows) => {
          this.regRows.set(rows);
          this.regBusy = false;
        },
        error: () => {
          this.regBusy = false;
          this.regErr = 'Load failed.';
        },
      });
  }

  private formPayload(): AttendancePayload {
    return {
      student_name: this.student_name.trim(),
      admission_no: this.admission_no.trim(),
      class_name: this.class_name.trim(),
      section: (this.section || '').trim(),
      date: this.record_date,
      academic_year: (this.academic_year || '').trim(),
      present: this.present,
      remarks: this.remarks.trim(),
      application_received: this.application_received,
      application_notes: this.application_notes.trim(),
    };
  }

  onAttendanceClassChange(): void {
    this.pickAdmissionNo = '';
    this.schoolRef.ensureStudentsForClass(this.class_name);
  }

  onPickStudentFromRoster(adm: string): void {
    if (!adm) return;
    const list = this.schoolRef.rosterFor(this.class_name);
    const s = list.find((x) => x.admission_no === adm);
    if (s) {
      this.student_name = s.full_name;
      this.admission_no = s.admission_no;
      this.class_name = s.class_name;
      this.section = (s.section || '').trim();
      this.schoolRef.ensureStudentsForClass(this.class_name);
    }
  }

  clearForm(): void {
    this.student_name = '';
    this.admission_no = '';
    this.class_name = '';
    this.section = '';
    this.pickAdmissionNo = '';
    this.record_date = todayISO();
    this.academic_year = this.defaultYear();
    this.present = true;
    this.remarks = '';
    this.application_received = false;
    this.application_notes = '';
    this.editingId = null;
    this.formErr = '';
  }

  edit(r: AttendanceRecord): void {
    this.editingId = r.id;
    this.student_name = r.student_name;
    this.admission_no = r.admission_no;
    this.class_name = r.class_name;
    this.section = r.section || '';
    this.pickAdmissionNo = r.admission_no;
    this.schoolRef.ensureStudentsForClass(r.class_name);
    this.record_date = r.date.slice(0, 10);
    this.academic_year = r.academic_year || this.defaultYear();
    this.present = r.present;
    this.remarks = r.remarks;
    this.application_received = r.application_received;
    this.application_notes = r.application_notes;
    this.formErr = '';
  }

  save(): void {
    if (
      !this.student_name.trim() ||
      !this.class_name.trim() ||
      !this.record_date
    ) {
      this.formErr = 'Student, class, and date are required.';
      return;
    }
    this.formErr = '';
    this.saving = true;
    const body = this.formPayload();
    const req =
      this.editingId != null
        ? this.api.updateAttendance(this.editingId, body)
        : this.api.createAttendance(body);
    req.subscribe({
      next: () => {
        this.saving = false;
        this.clearForm();
        this.loadRegister();
      },
      error: () => {
        this.saving = false;
        this.formErr = 'Save failed.';
      },
    });
  }

  remove(r: AttendanceRecord): void {
    if (!confirm(`Delete attendance row for ${r.student_name}?`)) return;
    this.api.deleteAttendance(r.id).subscribe({
      next: () => {
        if (this.editingId === r.id) this.clearForm();
        this.loadRegister();
      },
    });
  }

  loadCalendar(): void {
    this.calErr = '';
    if (!this.calClass.trim() || !this.calMonth.trim()) {
      this.calErr = 'Choose class and month.';
      return;
    }
    const [ys, ms] = this.calMonth.split('-');
    const y = parseInt(ys, 10);
    const m = parseInt(ms, 10);
    if (!y || !m) {
      this.calErr = 'Invalid month.';
      return;
    }
    const dim = daysInMonth(y, m);
    this.calDays = Array.from({ length: dim }, (_, i) => i + 1);
    this.schoolRef.ensureStudentsForClass(this.calClass);
    const from = `${y}-${pad2(m)}-01`;
    const to = `${y}-${pad2(m)}-${pad2(dim)}`;
    const sec = this.calSection.trim();
    this.calBusy = true;
    this.calCellMap = new Map();
    this.calHolidayDays = new Set();

    forkJoin({
      hols: this.api
        .listHolidaysInMonth(this.calMonth)
        .pipe(catchError(() => of<SchoolHoliday[]>([]))),
      rows: this.api
        .listAttendance({
          className: this.calClass.trim(),
          section: sec || undefined,
          dateFrom: from,
          dateTo: to,
        })
        .pipe(catchError(() => of<AttendanceRecord[]>([]))),
      roster: this.api
        .listStudents(this.calClass.trim())
        .pipe(catchError(() => of<Student[]>([]))),
    }).subscribe({
      next: ({ hols, rows, roster }) => {
        for (const h of hols) {
          const hk = normalizeAttendanceDateKey(h.holiday_date);
          const dp = parseISODateParts(hk);
          if (!dp || dp.y !== y || dp.m !== m) continue;
          if (dp.d >= 1 && dp.d <= dim) this.calHolidayDays.add(dp.d);
        }
        const list = sec
          ? roster.filter((s) => (s.section || '').trim() === sec)
          : roster;
        list.sort((a, b) => a.full_name.localeCompare(b.full_name));
        this.calStudents = list;
        const map = new Map<string, Map<number, 'P' | 'A'>>();
        for (const r of rows) {
          const adm = r.admission_no.trim();
          if (!map.has(adm)) map.set(adm, new Map());
          const rp = parseISODateParts(normalizeAttendanceDateKey(r.date));
          if (!rp || rp.y !== y || rp.m !== m) continue;
          if (rp.d >= 1 && rp.d <= dim) {
            map
              .get(adm)!
              .set(rp.d, attendanceIsPresent(r.present) ? 'P' : 'A');
          }
        }
        this.calCellMap = map;
        this.calBusy = false;
      },
      error: () => {
        this.calBusy = false;
        this.calErr = 'Could not load calendar data.';
      },
    });
  }

  calCell(adm: string, day: number): 'P' | 'A' | '' {
    return this.calCellMap.get(adm.trim())?.get(day) ?? '';
  }

  loadHolidays(): void {
    this.api
      .listHolidays()
      .pipe(catchError(() => of<SchoolHoliday[]>([])))
      .subscribe((list) => this.holidaysList.set(list));
  }

  saveHoliday(): void {
    this.holErr = '';
    if (!this.holDate || !this.holName.trim()) {
      this.holErr = 'Date and name are required.';
      return;
    }
    const body: SchoolHolidayPayload = {
      holiday_date: this.holDate,
      name: this.holName.trim(),
      notes: this.holNotes.trim(),
    };
    this.holBusy = true;
    const req =
      this.editingHolId != null
        ? this.api.updateHoliday(this.editingHolId, body)
        : this.api.createHoliday(body);
    req.subscribe({
      next: () => {
        this.holBusy = false;
        this.cancelHolidayEdit();
        this.loadHolidays();
      },
      error: () => {
        this.holBusy = false;
        this.holErr = 'Save failed.';
      },
    });
  }

  startEditHoliday(h: SchoolHoliday): void {
    this.editingHolId = h.id;
    this.holDate = h.holiday_date.slice(0, 10);
    this.holName = h.name;
    this.holNotes = h.notes || '';
    this.holErr = '';
  }

  cancelHolidayEdit(): void {
    this.editingHolId = null;
    this.holDate = todayISO();
    this.holName = '';
    this.holNotes = '';
    this.holErr = '';
  }

  removeHoliday(h: SchoolHoliday): void {
    if (!confirm(`Remove holiday “${h.name}”?`)) return;
    this.api.deleteHoliday(h.id).subscribe(() => this.loadHolidays());
  }

  private ensureHolidayWeeklyDefaults(): void {
    if (this.holWeeklyFrom && this.holWeeklyTo) return;
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const startY = m >= 4 ? y : y - 1;
    this.holWeeklyFrom = `${startY}-04-01`;
    this.holWeeklyTo = `${startY + 1}-03-31`;
  }

  generateWeeklyHolidays(): void {
    this.holErr = '';
    this.holGenMsg = '';
    if (!this.holWeeklyFrom || !this.holWeeklyTo) {
      this.holErr = 'Choose start and end dates for the range.';
      return;
    }
    if (this.holWeeklyTo < this.holWeeklyFrom) {
      this.holErr = 'End date must be on or after start date.';
      return;
    }
    const name = this.holWeeklyName.trim() || 'Weekly holiday';
    this.holBusy = true;
    this.api
      .generateWeeklyHolidays({
        date_from: this.holWeeklyFrom,
        date_to: this.holWeeklyTo,
        weekday: this.holWeeklyWeekday,
        name,
        notes: this.holWeeklyNotes.trim(),
        skip_if_date_has_holiday: this.holWeeklySkipIfBusy,
      })
      .subscribe({
        next: (created) => {
          this.holBusy = false;
          this.holGenMsg =
            created.length === 0
              ? 'No new rows added (dates may already have holidays, or there are no matching weekdays in the range).'
              : `Added ${created.length} holiday date(s).`;
          this.loadHolidays();
        },
        error: () => {
          this.holBusy = false;
          this.holErr = 'Could not generate recurring holidays.';
        },
      });
  }

  studentLabel(s: Student): string {
    return `${s.full_name} (${s.admission_no})`;
  }

  setView(v: AttendanceView): void {
    this.view = v;
    if (v === 'holidays') {
      this.ensureHolidayWeeklyDefaults();
      this.loadHolidays();
    }
  }
}
