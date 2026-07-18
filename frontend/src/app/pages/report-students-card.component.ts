import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ApiService, Student, StudentListPage } from '../core/api.service';
import { classTestOverallForStudent } from '../core/class-test-local.util';
import { SchoolRefService } from '../core/school-ref.service';
import { classWithSection } from '../core/report-student-helpers';

@Component({
  selector: 'app-report-students-card',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="rc-page">
      <header class="rc-head">
        <h1>Students report Card</h1>
        <p>Search by name or admission no., or load a full class. Class test marks use data saved on Class Tests (this browser).</p>
      </header>

      <div class="rc-toolbar no-print">
        <label class="rc-search">
          <span class="sr-only">Search Student</span>
          <input
            type="search"
            placeholder="Search Student"
            [ngModel]="studentQuery()"
            (ngModelChange)="studentQuery.set($event)"
            (keydown.enter)="searchByStudent()"
          />
        </label>
        <button type="button" class="rc-search-btn" [disabled]="!canSearch() || loading()" (click)="searchByStudent()" title="Search">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </button>
        <select class="rc-select" [ngModel]="className()" (ngModelChange)="className.set($event)">
          <option value="">--select class--</option>
          @for (c of classOptions(); track c.id) {
            <option [value]="c.name">{{ c.name }}</option>
          }
        </select>
        <select class="rc-select rc-year" [ngModel]="yearFilter()" (ngModelChange)="yearFilter.set($event)">
          @for (y of yearOptions(); track y) {
            <option [value]="y">{{ y }}</option>
          }
        </select>
        <button type="button" class="rc-load" [disabled]="!canLoadClass() || loading()" (click)="loadClass()">Load</button>
      </div>

      @if (loadError()) {
        <p class="rc-err">Could not load students.</p>
      }

      <div class="rc-table-wrap">
        <table class="rc-table">
          <thead>
            <tr>
              <th>Sr</th>
              <th>ID</th>
              <th>Student Name</th>
              <th>Class</th>
              <th>Tests</th>
              <th>Obtained</th>
              <th>Total</th>
              <th>Score</th>
              <th>Report card</th>
            </tr>
          </thead>
          <tbody>
            @for (s of rows(); track s.id; let i = $index) {
              <tr>
                <td>{{ i + 1 }}</td>
                <td>{{ s.admission_no || '—' }}</td>
                <td>{{ s.full_name || '—' }}</td>
                <td>{{ classWithSection(s) }}</td>
                <td>{{ ctSummary(s).tests }}</td>
                <td>{{ ctSummary(s).obtained }}</td>
                <td>{{ ctSummary(s).total }}</td>
                <td>{{ ctSummary(s).percent }}%</td>
                <td>
                  <a class="rc-link" [routerLink]="['/students', s.id, 'report']">Open</a>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="9" class="rc-empty">
                  @if (!hasLoaded()) {
                    Search for a student (year required), or select class + year and Load.
                  } @else {
                    No students found.
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
      .rc-page {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        background: #ffffff;
      }
      .rc-head {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 0.85rem 1rem;
      }
      .rc-head h1 {
        margin: 0;
        font-size: 1.05rem;
      }
      .rc-head p {
        margin: 0.25rem 0 0;
        color: var(--muted);
        font-size: 0.86rem;
      }
      .rc-search {
        flex: 1 1 260px;
        min-width: 220px;
      }
      .rc-search input {
        width: 100%;
        border: none;
        border-bottom: 2px solid var(--border);
        border-radius: 0;
        padding: 0.5rem 0.25rem;
        font: inherit;
        font-size: 1rem;
        background: transparent;
      }
      .rc-search input:focus {
        outline: none;
        border-bottom-color: #f97316;
      }
      .rc-search-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border: none;
        border-radius: 10px;
        background: var(--surface);
        border: 1px solid var(--border);
        cursor: pointer;
        color: var(--text);
      }
      .rc-search-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .rc-toolbar {
        display: flex;
        flex-wrap: nowrap;
        gap: 0.5rem;
        align-items: center;
        overflow-x: auto;
        padding-bottom: 0.1rem;
      }
      .rc-select {
        min-height: 40px;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 0.35rem 0.6rem;
        font: inherit;
        min-width: 160px;
      }
      .rc-year {
        min-width: 110px;
      }
      .rc-load {
        border: none;
        border-radius: 999px;
        min-height: 40px;
        padding: 0.5rem 1rem;
        background: linear-gradient(135deg, #f59e0b, #fbbf24);
        color: #111827;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .rc-load:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .rc-err {
        color: #b91c1c;
        font-weight: 600;
      }
      .rc-table-wrap {
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: var(--surface);
      }
      .rc-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 820px;
        font-size: 0.86rem;
      }
      .rc-table th,
      .rc-table td {
        border-bottom: 1px solid var(--border);
        padding: 0.45rem 0.55rem;
        text-align: left;
      }
      .rc-table thead th {
        background: var(--bg-subtle);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .rc-link {
        font-weight: 700;
        color: #c2410c;
        text-decoration: none;
      }
      .rc-link:hover {
        text-decoration: underline;
      }
      .rc-empty {
        color: var(--muted);
        text-align: center;
        padding: 1.25rem !important;
      }
      @media (max-width: 900px) {
        .rc-toolbar {
          flex-wrap: wrap;
          overflow-x: visible;
        }
        .rc-search {
          flex: 1 1 100%;
        }
      }
    `,
  ],
})
export class ReportStudentsCardComponent {
  private readonly api = inject(ApiService);
  private readonly schoolRef = inject(SchoolRefService);

  readonly className = signal('');
  readonly yearFilter = signal('');
  readonly studentQuery = signal('');
  readonly loading = signal(false);
  readonly loadError = signal(false);
  readonly hasLoaded = signal(false);
  readonly rows = signal<Student[]>([]);

  readonly classOptions = computed(() =>
    [...this.schoolRef.classes()].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
  );

  readonly yearOptions = computed(() => {
    const fromSchool = this.schoolRef
      .academicYears()
      .map((y) => (y.label || '').trim())
      .filter(Boolean);
    const def = (this.schoolRef.defaultAcademicYear() || '').trim();
    const set = new Set<string>(fromSchool);
    if (def) set.add(def);
    return [...set].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  });

  readonly classWithSection = classWithSection;

  constructor() {
    this.schoolRef.afterDefaultAcademicYearLoaded().subscribe(() => this.pickYear());
    queueMicrotask(() => this.pickYear());
  }

  private pickYear(): void {
    if (this.yearFilter().trim()) return;
    const rows = this.schoolRef.academicYears();
    const current = rows.find((r) => r.is_current)?.label?.trim();
    if (current) {
      this.yearFilter.set(current);
      return;
    }
    const cal = this.schoolRef.defaultAcademicYear().trim();
    if (cal) this.yearFilter.set(cal);
  }

  canLoadClass(): boolean {
    return this.className().trim() !== '' && this.yearFilter().trim() !== '';
  }

  canSearch(): boolean {
    return this.yearFilter().trim() !== '' && this.studentQuery().trim() !== '';
  }

  ctSummary(s: Student): { tests: number; obtained: number; total: number; percent: number } {
    return classTestOverallForStudent(s.id, s.class_name || '');
  }

  loadClass(): void {
    if (!this.canLoadClass()) return;
    this.loading.set(true);
    this.loadError.set(false);
    this.hasLoaded.set(true);
    const cn = this.className().trim();
    this.api
      .listStudentsPage({
        className: cn,
        academicYear: this.yearFilter().trim(),
        skip: 0,
        limit: 200,
      })
      .pipe(
        catchError(() => {
          this.loadError.set(true);
          return of<StudentListPage>({ items: [], total: 0, skip: 0, limit: 200 });
        }),
      )
      .subscribe({
        next: (page) => {
          this.rows.set(page.items);
          this.loading.set(false);
        },
      });
  }

  searchByStudent(): void {
    if (!this.canSearch()) return;
    this.loading.set(true);
    this.loadError.set(false);
    this.hasLoaded.set(true);
    const cn = this.className().trim();
    this.api
      .listStudentsPage({
        ...(cn ? { className: cn } : {}),
        academicYear: this.yearFilter().trim(),
        q: this.studentQuery().trim(),
        skip: 0,
        limit: 200,
      })
      .pipe(
        catchError(() => {
          this.loadError.set(true);
          return of<StudentListPage>({ items: [], total: 0, skip: 0, limit: 200 });
        }),
      )
      .subscribe({
        next: (page) => {
          this.rows.set(page.items);
          this.loading.set(false);
        },
      });
  }
}
