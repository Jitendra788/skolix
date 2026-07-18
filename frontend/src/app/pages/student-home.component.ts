import { DecimalPipe, NgClass } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of, switchMap } from 'rxjs';
import { ApiService, Homework, Notice, Student, StudentReport, StudentReportClassTestSubject } from '../core/api.service';
import {
  HomeworkDueStatus,
  homeworkDueStatus,
  isHomeworkDone,
  toggleHomeworkDone,
} from '../core/homework-completion.util';
import { SessionService } from '../core/session.service';
import {
  TtCell,
  TtPeriodRow,
  TtWeekdayRow,
  loadActiveWeekdays,
  loadPeriods,
  resolveStudentTimetable,
} from '../core/timetable-local.util';
import { StudentTimetableGridComponent } from './student-timetable-grid.component';
import { homeworkDescriptionPreview } from '../core/homework-description.util';

export type CalendarCell = { day: number; isToday: boolean } | null;

@Component({
  selector: 'app-student-home',
  standalone: true,
  imports: [RouterLink, StudentTimetableGridComponent, DecimalPipe, NgClass],
  templateUrl: './student-home.component.html',
  styleUrls: ['./student-home.component.scss'],
})
export class StudentHomeComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  loading = false;
  profile: Student | null = null;
  report: StudentReport | null = null;
  classHomeworkCount = 0;
  todayHomeworkCount = 0;
  totalNotices = 0;
  latestNotices: Notice[] = [];
  latestHomework: Homework[] = [];
  upcomingHomework: Homework[] = [];
  performanceRows: { rank: number; subject: string; score: string; percent: number }[] = [];
  todayIso = new Date().toISOString().slice(0, 10);
  ttDays: TtWeekdayRow[] = [];
  ttPeriods: TtPeriodRow[] = [];
  ttCells: Record<string, TtCell> = {};
  ttLabel = '';
  ttNoMatch = false;
  calMonth = new Date();
  /** Selected day-of-month in calendar (filters upcoming list); null = show all. */
  calSelectedDay: number | null = null;

  ngOnInit(): void {
    const id = Number(this.session.userId() || 0);
    if (!id) return;
    this.loading = true;
    this.api
      .getStudent(id)
      .pipe(
        catchError(() => of(null)),
        switchMap((st) => {
          if (!st) return of(null);
          this.profile = st;
          return forkJoin({
            classHw: this.api.getHomeworks({ class: st.class_name }).pipe(catchError(() => of([]))),
            todayClassHw: this.api
              .getHomeworks({ class: st.class_name, date: this.todayIso })
              .pipe(catchError(() => of([]))),
            notices: this.api.listNotices().pipe(catchError(() => of([]))),
            schoolClasses: this.api.listSchoolClasses().pipe(catchError(() => of([]))),
            report: this.api.getStudentReport(st.id).pipe(catchError(() => of(null))),
          });
        }),
      )
      .subscribe({
        next: (res) => {
          this.loading = false;
          if (!res) return;
          this.report = res.report;
          this.classHomeworkCount = res.classHw.length;
          this.todayHomeworkCount = res.todayClassHw.length;
          this.totalNotices = res.notices.length;
          const byCreated = (a: { created_at?: string }, b: { created_at?: string }) =>
            (b.created_at || '').localeCompare(a.created_at || '');
          this.latestNotices = [...res.notices].sort(byCreated).slice(0, 5);
          this.latestHomework = [...res.todayClassHw].sort(byCreated).slice(0, 4);

          const future = [...res.classHw]
            .filter((h) => (h.date || '') >= this.todayIso)
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
          this.upcomingHomework = (
            future.length ? future : [...res.classHw].sort((a, b) => (a.date || '').localeCompare(b.date || ''))
          ).slice(0, 6);

          this.performanceRows = this.buildPerformanceRows(res.report?.class_tests ?? []);

          const pt = resolveStudentTimetable(
            this.profile?.class_name ?? '',
            this.profile?.section,
            res.schoolClasses,
          );
          this.ttCells = pt.cells;
          this.ttLabel = pt.label;
          this.ttNoMatch = pt.noClassMatch;
          this.ttDays = loadActiveWeekdays();
          this.ttPeriods = loadPeriods();
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  private buildPerformanceRows(tests: StudentReportClassTestSubject[]) {
    const sorted = [...tests].sort((a, b) => b.percent - a.percent);
    return sorted.map((r, i) => ({
      rank: i + 1,
      subject: r.subject,
      score: `${r.obtained_marks}/${r.total_marks}`,
      percent: r.percent,
    }));
  }

  filteredUpcomingHomework(): Homework[] {
    if (this.calSelectedDay == null) return this.upcomingHomework;
    const y = this.calMonth.getFullYear();
    const m = this.calMonth.getMonth();
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(this.calSelectedDay).padStart(2, '0')}`;
    return this.upcomingHomework.filter((h) => (h.date || '').slice(0, 10) === iso);
  }

  selectCalDay(day: number): void {
    this.calSelectedDay = this.calSelectedDay === day ? null : day;
  }

  calDayIsSelected(day: number): boolean {
    return this.calSelectedDay === day;
  }

  hwDueStatus(h: Homework): HomeworkDueStatus {
    return homeworkDueStatus(h.id, h.date || '', this.todayIso);
  }

  hwStatusLabel(h: Homework): string {
    const s = this.hwDueStatus(h);
    if (s === 'completed') return 'Completed';
    if (s === 'overdue') return 'Overdue';
    return 'Pending';
  }

  hwStatusClass(h: Homework): string {
    const s = this.hwDueStatus(h);
    if (s === 'completed') return 'dash-hw-done';
    if (s === 'overdue') return 'dash-hw-overdue';
    return 'dash-hw-pending';
  }

  toggleHwDone(id: number, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    toggleHomeworkDone(id);
  }

  hwDone(id: number): boolean {
    return isHomeworkDone(id);
  }

  attBarWidth(): number {
    const p = this.report?.attendance?.overall_percent;
    return Math.min(100, Math.max(0, p ?? 0));
  }

  testsBarWidth(): number {
    const tests = this.report?.class_tests ?? [];
    if (!tests.length) return 0;
    const sum = tests.reduce((a, t) => a + t.percent, 0);
    return Math.min(100, Math.max(0, sum / tests.length));
  }

  testsBarLabel(): string {
    const tests = this.report?.class_tests ?? [];
    if (!tests.length) return '—';
    return `${Math.round(this.testsBarWidth())}%`;
  }

  displayName(): string {
    return this.session.displayName() || 'Student';
  }

  firstName(): string {
    const n = this.displayName().trim();
    if (!n) return 'Student';
    return n.split(/\s+/)[0] ?? n;
  }

  attendancePercentDisplay(): string {
    const p = this.report?.attendance?.overall_percent;
    if (p === undefined || p === null || Number.isNaN(p)) return '—';
    return `${Math.round(p)}%`;
  }

  marksLine(): string {
    const tests = this.report?.class_tests ?? [];
    if (!tests.length) return '—';
    let got = 0;
    let tot = 0;
    for (const t of tests) {
      got += t.obtained_marks;
      tot += t.total_marks;
    }
    if (tot <= 0) return '—';
    return `${got}/${tot}`;
  }

  homeworkStatLine(): string {
    if (this.loading) return '…';
    return `${this.todayHomeworkCount} / ${this.classHomeworkCount}`;
  }

  calendarTitle(): string {
    return this.calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  prevCalMonth(): void {
    const d = new Date(this.calMonth);
    d.setMonth(d.getMonth() - 1);
    this.calMonth = d;
    this.calSelectedDay = null;
  }

  nextCalMonth(): void {
    const d = new Date(this.calMonth);
    d.setMonth(d.getMonth() + 1);
    this.calMonth = d;
    this.calSelectedDay = null;
  }

  calendarWeekdayLabels(): string[] {
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  }

  calendarMatrix(): CalendarCell[][] {
    const y = this.calMonth.getFullYear();
    const m = this.calMonth.getMonth();
    const first = new Date(y, m, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = new Date();
    const flat: CalendarCell[] = [];
    for (let i = 0; i < startPad; i++) {
      flat.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
      flat.push({ day: d, isToday });
    }
    while (flat.length % 7 !== 0) {
      flat.push(null);
    }
    const rows: CalendarCell[][] = [];
    for (let i = 0; i < flat.length; i += 7) {
      rows.push(flat.slice(i, i + 7));
    }
    return rows;
  }

  formatHomeworkDate(iso: string): string {
    if (!iso) return '—';
    try {
      return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  }

  todayLabel(): string {
    return new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }

  formatShortDate(iso: string): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  }

  formatNoticeDate(iso: string): string {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = d.getFullYear();
      return `${dd}/${mm}/${yy}`;
    } catch {
      return iso;
    }
  }

  truncate(text: string, max = 72): string {
    const t = (text || '').trim();
    return t.length <= max ? t : `${t.slice(0, max).trim()}…`;
  }

  homeworkPreview(html: string | null | undefined, max: number): string {
    return homeworkDescriptionPreview(html, max);
  }

  focusHomework(): Homework | null {
    return this.latestHomework[0] ?? null;
  }

}
