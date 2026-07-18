import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { ApiService, Faculty } from '../core/api.service';

interface StaffMonthRow {
  id: number;
  name: string;
  designation: string;
  phone: string;
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
  selector: 'app-staff-monthly-attendance-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="sar-page">
      <header class="sar-head">
        <h1>Staff Monthly Attendance Report</h1>
        <p>Faculty roster based monthly view. Attendance columns are ready for backend staff-attendance integration.</p>
      </header>

      <div class="sar-toolbar no-print">
        <input class="sar-month" type="month" [ngModel]="yearMonth()" (ngModelChange)="yearMonth.set($event)" />
        <input class="sar-date" type="date" [ngModel]="dateFrom()" (ngModelChange)="dateFrom.set($event)" />
        <input class="sar-date" type="date" [ngModel]="dateTo()" (ngModelChange)="dateTo.set($event)" />
        <input
          class="sar-search"
          type="search"
          placeholder="Search staff..."
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
        />
        <button type="button" class="sar-load" [disabled]="loading()" (click)="loadReport()">Load</button>
        <button type="button" class="sar-export" [disabled]="!filteredRows().length" (click)="exportCsv()">Export CSV</button>
        <button type="button" class="sar-export" [disabled]="!filteredRows().length" (click)="printReport()">Print</button>
      </div>

      <div class="sar-kpis">
        <div><span>Total Staff</span><strong>{{ filteredRows().length }}</strong></div>
        <div><span>Present</span><strong>{{ totals().present }}</strong></div>
        <div><span>Absent</span><strong>{{ totals().absent }}</strong></div>
        <div><span>Leaves</span><strong>{{ totals().leave }}</strong></div>
      </div>

      @if (error()) {
        <p class="sar-err">{{ error() }}</p>
      }

      <div class="sar-table-wrap">
        <table class="sar-table">
          <thead>
            <tr>
              <th>Sr</th>
              <th>Name</th>
              <th>Designation</th>
              <th>Phone</th>
              <th>Present</th>
              <th>Absent</th>
              <th>Leave</th>
              <th>Marked Days</th>
              <th>Attendance %</th>
            </tr>
          </thead>
          <tbody>
            @for (r of filteredRows(); track r.id; let i = $index) {
              <tr>
                <td>{{ i + 1 }}</td>
                <td>{{ r.name }}</td>
                <td>{{ r.designation || '—' }}</td>
                <td>{{ r.phone || '—' }}</td>
                <td>{{ r.present_days }}</td>
                <td>{{ r.absent_days }}</td>
                <td>{{ r.leave_days }}</td>
                <td>{{ r.total_marked_days }}</td>
                <td>{{ r.attendance_percent }}%</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="9" class="sar-empty">
                  @if (!loaded()) {
                    Click Load to fetch staff roster.
                  } @else {
                    No staff found.
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
      .sar-page { display: flex; flex-direction: column; gap: 0.75rem; }
      .sar-head { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 0.85rem 1rem; }
      .sar-head h1 { margin: 0; font-size: 1.05rem; }
      .sar-head p { margin: 0.25rem 0 0; color: var(--muted); font-size: 0.86rem; }
      .sar-toolbar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
      .sar-month, .sar-search, .sar-date {
        min-height: 40px; border: 1px solid var(--border); border-radius: 10px; padding: 0.35rem 0.6rem; font: inherit;
      }
      .sar-search { min-width: 240px; }
      .sar-load {
        border: none; border-radius: 999px; min-height: 40px; padding: 0.5rem 1rem;
        background: linear-gradient(135deg, #f59e0b, #fbbf24); color: #111827; font: inherit; font-weight: 700; cursor: pointer;
      }
      .sar-load:disabled { opacity: 0.45; cursor: not-allowed; }
      .sar-export {
        border: 1px solid var(--border); border-radius: 10px; min-height: 40px; padding: 0.45rem 0.8rem;
        background: var(--surface); font: inherit; font-weight: 600; cursor: pointer;
      }
      .sar-export:disabled { opacity: 0.45; cursor: not-allowed; }
      .sar-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.5rem; }
      .sar-kpis div { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 0.5rem 0.65rem; }
      .sar-kpis span { display: block; color: var(--muted); font-size: 0.78rem; }
      .sar-kpis strong { display: block; margin-top: 0.15rem; font-size: 1rem; }
      .sar-err { color: #b91c1c; font-weight: 600; }
      .sar-table-wrap { overflow: auto; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
      .sar-table { width: 100%; border-collapse: collapse; min-width: 880px; font-size: 0.86rem; }
      .sar-table th, .sar-table td { border-bottom: 1px solid var(--border); padding: 0.45rem 0.55rem; text-align: left; }
      .sar-table thead th { background: var(--bg-subtle); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; }
      .sar-empty { color: var(--muted); text-align: center; padding: 1.25rem !important; }
      @media (max-width: 860px) { .sar-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media print {
        .no-print { display: none !important; }
        .sar-page { gap: 0.4rem; }
        .sar-head, .sar-kpis div, .sar-table-wrap {
          border: 1px solid #d1d5db;
          border-radius: 0;
          box-shadow: none;
        }
        .sar-table-wrap { overflow: visible; background: #fff; }
        .sar-table { min-width: 100%; font-size: 12px; }
        .sar-table th, .sar-table td { padding: 0.3rem 0.35rem; }
      }
    `,
  ],
})
export class StaffMonthlyAttendanceReportComponent {
  private readonly api = inject(ApiService);

  readonly yearMonth = signal(currentYearMonth());
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly query = signal('');
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly rows = signal<StaffMonthRow[]>([]);

  readonly filteredRows = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.rows();
    return this.rows().filter((r) =>
      [r.name, r.designation, r.phone].join(' ').toLowerCase().includes(q),
    );
  });

  readonly totals = computed(() => {
    const rows = this.filteredRows();
    return rows.reduce(
      (acc, r) => {
        acc.present += r.present_days;
        acc.absent += r.absent_days;
        acc.leave += r.leave_days;
        return acc;
      },
      { present: 0, absent: 0, leave: 0 },
    );
  });

  loadReport(): void {
    const from = this.dateFrom().trim();
    const to = this.dateTo().trim();
    if (from && to && from > to) {
      this.error.set('From date cannot be after To date.');
      return;
    }
    this.loading.set(true);
    this.loaded.set(true);
    this.error.set('');
    this.api
      .listFaculty()
      .pipe(catchError(() => of<Faculty[]>([])))
      .subscribe({
        next: (list) => {
          const out = list
            .map((f) => ({
              id: f.id,
              name: (f.name || '').trim(),
              designation: (f.designation || '').trim(),
              phone: (f.phone || '').trim(),
              present_days: 0,
              absent_days: 0,
              leave_days: 0,
              total_marked_days: 0,
              attendance_percent: 0,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
          this.rows.set(out);
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.loading.set(false);
          this.error.set('Could not load staff report.');
        },
      });
  }

  exportCsv(): void {
    if (!this.filteredRows().length) return;
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = ['Name', 'Designation', 'Phone', 'Present', 'Absent', 'Leave', 'Marked Days', 'Attendance %'];
    const body = this.filteredRows().map((r) =>
      [
        r.name,
        r.designation || '',
        r.phone || '',
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
    a.download = `staff-monthly-attendance-${this.yearMonth()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  printReport(): void {
    window.print();
  }
}

