import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiService, AttendanceRecord, Student } from '../core/api.service';
import { SchoolRefService } from '../core/school-ref.service';

interface StudentMonthRow {
  admission_no: string;
  student_name: string;
  class_name: string;
  section: string;
  present_days: number;
  absent_days: number;
  leave_days: number;
  total_marked_days: number;
  attendance_percent: number;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

@Component({
  selector: 'app-students-monthly-attendance-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="mar-page">
      <header class="mar-head">
        <h1>Students Monthly Attendance Report</h1>
        <p>Load class-wise monthly attendance summary with present, absent, leave and percentage.</p>
      </header>

      <div class="mar-toolbar no-print">
        <select class="mar-select" [ngModel]="className()" (ngModelChange)="className.set($event)">
          <option value="">--select class--</option>
          @for (c of classOptions(); track c.id) {
            <option [value]="c.name">{{ c.name }}</option>
          }
        </select>
        <select class="mar-select mar-year" [ngModel]="yearFilter()" (ngModelChange)="yearFilter.set($event)">
          @for (y of yearOptions(); track y) {
            <option [value]="y">{{ y }}</option>
          }
        </select>
        <input class="mar-month" type="month" [ngModel]="yearMonth()" (ngModelChange)="yearMonth.set($event)" />
        <input class="mar-date" type="date" [ngModel]="dateFrom()" (ngModelChange)="dateFrom.set($event)" />
        <input class="mar-date" type="date" [ngModel]="dateTo()" (ngModelChange)="dateTo.set($event)" />
        <button type="button" class="mar-load" [disabled]="!canLoad() || loading()" (click)="loadReport()">
          Load
        </button>
        <button type="button" class="mar-export" [disabled]="!rows().length" (click)="exportCsv()">Export CSV</button>
        <button type="button" class="mar-export" [disabled]="!rows().length" (click)="printReport()">Print</button>
      </div>

      <div class="mar-kpis">
        <div><span>Students</span><strong>{{ rows().length }}</strong></div>
        <div><span>Total Present</span><strong>{{ totals().present }}</strong></div>
        <div><span>Total Absent</span><strong>{{ totals().absent }}</strong></div>
        <div><span>Avg Attendance</span><strong>{{ totals().avgPercent }}%</strong></div>
      </div>

      @if (error()) {
        <p class="mar-err">{{ error() }}</p>
      }

      <div class="mar-table-wrap">
        <table class="mar-table">
          <thead>
            <tr>
              <th>Sr</th>
              <th>Admission No</th>
              <th>Student Name</th>
              <th>Class</th>
              <th>Present</th>
              <th>Absent</th>
              <th>Leave</th>
              <th>Marked Days</th>
              <th>Attendance %</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.admission_no; let i = $index) {
              <tr>
                <td>{{ i + 1 }}</td>
                <td>{{ r.admission_no }}</td>
                <td>{{ r.student_name }}</td>
                <td>{{ r.class_name }}{{ r.section ? ' (' + r.section + ')' : '' }}</td>
                <td>{{ r.present_days }}</td>
                <td>{{ r.absent_days }}</td>
                <td>{{ r.leave_days }}</td>
                <td>{{ r.total_marked_days }}</td>
                <td>{{ r.attendance_percent }}%</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="9" class="mar-empty">
                  @if (!loaded()) {
                    Select class, year and month, then click Load.
                  } @else {
                    No attendance records found for selected filters.
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: [
    `
      .mar-page { display: flex; flex-direction: column; gap: 0.75rem; }
      .mar-head { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 0.85rem 1rem; }
      .mar-head h1 { margin: 0; font-size: 1.05rem; }
      .mar-head p { margin: 0.25rem 0 0; color: var(--muted); font-size: 0.86rem; }
      .mar-toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
      .mar-select, .mar-month, .mar-date {
        min-height: 40px; border: 1px solid var(--border); border-radius: 10px;
        padding: 0.35rem 0.6rem; font: inherit;
      }
      .mar-select { min-width: 170px; }
      .mar-year { min-width: 120px; }
      .mar-load {
        border: none; border-radius: 999px; min-height: 40px; padding: 0.5rem 1rem;
        background: linear-gradient(135deg, #f59e0b, #fbbf24); color: #111827; font: inherit; font-weight: 700; cursor: pointer;
      }
      .mar-load:disabled { opacity: 0.45; cursor: not-allowed; }
      .mar-export {
        border: 1px solid var(--border); border-radius: 10px; min-height: 40px; padding: 0.45rem 0.8rem;
        background: var(--surface); font: inherit; font-weight: 600; cursor: pointer;
      }
      .mar-export:disabled { opacity: 0.45; cursor: not-allowed; }
      .mar-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.5rem; }
      .mar-kpis div { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 0.5rem 0.65rem; }
      .mar-kpis span { display: block; color: var(--muted); font-size: 0.78rem; }
      .mar-kpis strong { display: block; margin-top: 0.15rem; font-size: 1rem; }
      .mar-err { color: #b91c1c; font-weight: 600; }
      .mar-table-wrap { overflow: auto; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
      .mar-table { width: 100%; border-collapse: collapse; min-width: 880px; font-size: 0.86rem; }
      .mar-table th, .mar-table td { border-bottom: 1px solid var(--border); padding: 0.45rem 0.55rem; text-align: left; }
      .mar-table thead th { background: var(--bg-subtle); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; }
      .mar-empty { color: var(--muted); text-align: center; padding: 1.25rem !important; }
      @media (max-width: 860px) { .mar-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media print {
        .no-print { display: none !important; }
        .mar-page { gap: 0.4rem; }
        .mar-head, .mar-kpis div, .mar-table-wrap {
          border: 1px solid #d1d5db;
          border-radius: 0;
          box-shadow: none;
        }
        .mar-table-wrap { overflow: visible; background: #fff; }
        .mar-table { min-width: 100%; font-size: 12px; }
        .mar-table th, .mar-table td { padding: 0.3rem 0.35rem; }
      }
    `,
  ],
})
export class StudentsMonthlyAttendanceReportComponent {
  private readonly api = inject(ApiService);
  private readonly schoolRef = inject(SchoolRefService);

  readonly className = signal('');
  readonly yearFilter = signal('');
  readonly yearMonth = signal(currentYearMonth());
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly rows = signal<StudentMonthRow[]>([]);
  readonly totals = computed(() => {
    const list = this.rows();
    const sum = list.reduce(
      (acc, r) => {
        acc.present += r.present_days;
        acc.absent += r.absent_days;
        acc.percent += r.attendance_percent;
        return acc;
      },
      { present: 0, absent: 0, percent: 0 },
    );
    return {
      present: sum.present,
      absent: sum.absent,
      avgPercent: list.length ? Math.round((sum.percent / list.length) * 100) / 100 : 0,
    };
  });

  readonly classOptions = computed(() =>
    [...this.schoolRef.classes()].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
  );

  readonly yearOptions = computed(() => {
    const fromSchool = this.schoolRef.academicYears().map((y) => (y.label || '').trim()).filter(Boolean);
    const def = (this.schoolRef.defaultAcademicYear() || '').trim();
    const set = new Set<string>(fromSchool);
    if (def) set.add(def);
    return [...set].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  });

  constructor() {
    this.schoolRef.afterDefaultAcademicYearLoaded().subscribe(() => this.pickYear());
    queueMicrotask(() => this.pickYear());
  }

  private pickYear(): void {
    if (this.yearFilter().trim()) return;
    const current = this.schoolRef.academicYears().find((r) => r.is_current)?.label?.trim();
    if (current) {
      this.yearFilter.set(current);
      return;
    }
    const def = this.schoolRef.defaultAcademicYear().trim();
    if (def) this.yearFilter.set(def);
  }

  canLoad(): boolean {
    return this.className().trim() !== '' && this.yearFilter().trim() !== '' && this.yearMonth().trim() !== '';
  }

  loadReport(): void {
    if (!this.canLoad()) return;
    this.loading.set(true);
    this.loaded.set(true);
    this.error.set('');
    const className = this.className().trim();
    const academicYear = this.yearFilter().trim();
    const ym = this.yearMonth().trim();
    const from = this.dateFrom().trim();
    const to = this.dateTo().trim();
    if (from && to && from > to) {
      this.loading.set(false);
      this.error.set('From date cannot be after To date.');
      return;
    }

    forkJoin({
      roster: this.api.listStudents(className).pipe(catchError(() => of<Student[]>([]))),
      rows: this.api
        .listAttendance({ className, academicYear, ...(from ? { dateFrom: from } : {}), ...(to ? { dateTo: to } : {}), ...(!from && !to ? { yearMonth: ym } : {}) })
        .pipe(catchError(() => of<AttendanceRecord[]>([]))),
    }).subscribe({
      next: ({ roster, rows }) => {
        const byAdm = new Map<string, StudentMonthRow>();
        for (const s of roster) {
          const adm = (s.admission_no || '').trim();
          if (!adm) continue;
          byAdm.set(adm, {
            admission_no: adm,
            student_name: s.full_name || '',
            class_name: s.class_name || className,
            section: (s.section || '').trim(),
            present_days: 0,
            absent_days: 0,
            leave_days: 0,
            total_marked_days: 0,
            attendance_percent: 0,
          });
        }
        for (const a of rows) {
          const adm = (a.admission_no || '').trim();
          if (!adm) continue;
          if (!byAdm.has(adm)) {
            byAdm.set(adm, {
              admission_no: adm,
              student_name: a.student_name || '',
              class_name: a.class_name || className,
              section: (a.section || '').trim(),
              present_days: 0,
              absent_days: 0,
              leave_days: 0,
              total_marked_days: 0,
              attendance_percent: 0,
            });
          }
          const row = byAdm.get(adm)!;
          row.total_marked_days += 1;
          if (a.present) {
            row.present_days += 1;
          } else {
            row.absent_days += 1;
            if (a.application_received) row.leave_days += 1;
          }
        }
        const out = [...byAdm.values()]
          .map((r) => ({
            ...r,
            attendance_percent: r.total_marked_days
              ? Math.round((r.present_days / r.total_marked_days) * 10000) / 100
              : 0,
          }))
          .sort((a, b) => a.student_name.localeCompare(b.student_name));
        this.rows.set(out);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.rows.set([]);
        this.error.set('Could not load monthly attendance report.');
      },
    });
  }

  exportCsv(): void {
    if (!this.rows().length) return;
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = ['Admission No', 'Student Name', 'Class', 'Present', 'Absent', 'Leave', 'Marked Days', 'Attendance %'];
    const body = this.rows().map((r) =>
      [
        r.admission_no,
        r.student_name,
        `${r.class_name}${r.section ? ` (${r.section})` : ''}`,
        String(r.present_days),
        String(r.absent_days),
        String(r.leave_days),
        String(r.total_marked_days),
        String(r.attendance_percent),
      ]
        .map(esc)
        .join(','),
    );
    const csv = [header.map(esc).join(','), ...body].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `students-monthly-attendance-${this.yearMonth()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  printReport(): void {
    window.print();
  }
}

