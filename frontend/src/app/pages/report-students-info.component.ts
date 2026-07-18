import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { ApiService, Student, StudentListPage } from '../core/api.service';
import { SchoolRefService } from '../core/school-ref.service';
import {
  admissionDateDisplay,
  ageFromStudent,
  classWithSection,
  discountFeeLabel,
  dobDisplay,
  extraStr,
  fatherName,
  genderLabel,
} from '../core/report-student-helpers';

type ColKey =
  | 'sr'
  | 'admissionId'
  | 'studentName'
  | 'fatherName'
  | 'classCol'
  | 'discount'
  | 'admissionDate'
  | 'dob'
  | 'age'
  | 'gender'
  | 'birthForm';

const COL_META: { key: ColKey; label: string }[] = [
  { key: 'sr', label: 'Sr' },
  { key: 'admissionId', label: 'ID' },
  { key: 'studentName', label: 'Student Name' },
  { key: 'fatherName', label: 'Father Name' },
  { key: 'classCol', label: 'Class' },
  { key: 'discount', label: 'Discount in Fee' },
  { key: 'admissionDate', label: 'Admission Date' },
  { key: 'dob', label: 'Date Of Birth' },
  { key: 'age', label: 'Age' },
  { key: 'gender', label: 'Gender' },
  { key: 'birthForm', label: 'Student Birth Form ID' },
];

@Component({
  selector: 'app-report-students-info',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="rep-page" id="rep-students-info-print">
      <header class="rep-head">
        <h1>Students info report</h1>
        <p>Select class and academic year, then search or export like the admin reports screen.</p>
      </header>

      <div class="rep-toolbar">
        <div class="rep-filters">
          <select
            class="rep-select"
            [ngModel]="className()"
            (ngModelChange)="className.set($event)"
          >
            <option value="">--select class--</option>
            @for (c of classOptions(); track c.id) {
              <option [value]="c.name">{{ c.name }}</option>
            }
          </select>
          <select class="rep-select rep-year" [ngModel]="yearFilter()" (ngModelChange)="yearFilter.set($event)">
            @for (y of yearOptions(); track y) {
              <option [value]="y">{{ y }}</option>
            }
          </select>
          <button type="button" class="rep-icon-btn" [disabled]="!canLoad() || loading()" (click)="load()" title="Load">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
        </div>

        <div class="rep-actions no-print">
          <button type="button" (click)="copyExport()" [disabled]="!filteredRows().length">Copy</button>
          <button type="button" (click)="csvExport()" [disabled]="!filteredRows().length">CSV</button>
          <button type="button" (click)="excelExport()" [disabled]="!filteredRows().length">Excel</button>
          <button type="button" (click)="printReport()" [disabled]="!filteredRows().length">PDF</button>
          <button type="button" (click)="printReport()" [disabled]="!filteredRows().length">Print</button>
          <div class="rep-dd">
            <button type="button" class="rep-dd-btn">Column visibility</button>
            <div class="rep-dd-panel">
              @for (c of COL_META; track c.key) {
                <label class="rep-cb">
                  <input type="checkbox" [checked]="colVisible()[c.key]" (change)="toggleCol(c.key, $event)" />
                  {{ c.label }}
                </label>
              }
            </div>
          </div>
          <label class="rep-search">
            <span>Search:</span>
            <input type="search" [ngModel]="searchQuery()" (ngModelChange)="onSearch($event)" placeholder="Filter rows..." />
          </label>
        </div>
      </div>

      @if (loadError()) {
        <p class="rep-err">Could not load students. Check API and filters.</p>
      }

      <div class="rep-table-wrap">
        <table class="rep-table">
          <thead>
            <tr>
              @for (c of visibleColMeta(); track c.key) {
                <th>{{ c.label }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (s of pagedRows(); track s.id; let i = $index) {
              <tr>
                @for (c of visibleColMeta(); track c.key) {
                  <td>{{ cellValue(c.key, s, pageIndex() * pageSize() + i + 1) }}</td>
                }
              </tr>
            } @empty {
              <tr>
                <td [attr.colspan]="maxColspan()" class="rep-empty">
                  @if (!hasLoaded()) {
                    Choose class and year, then click the search button to load.
                  } @else {
                    No rows match.
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <footer class="rep-foot no-print">
        <span>
          @if (filteredRows().length) {
            Showing {{ rangeFrom() }} to {{ rangeTo() }} of {{ filteredRows().length }} entries
          } @else {
            Showing 0 entries
          }
        </span>
        <div class="rep-pager">
          <button type="button" [disabled]="pageIndex() <= 0" (click)="prev()">Previous</button>
          <span class="rep-page-num">{{ pageIndex() + 1 }}</span>
          <button type="button" [disabled]="pageIndex() >= totalPages() - 1" (click)="next()">Next</button>
        </div>
      </footer>
    </section>
  `,
  styles: [
    `
      .rep-page {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .rep-head {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 0.85rem 1rem;
      }
      .rep-head h1 {
        margin: 0;
        font-size: 1.05rem;
      }
      .rep-head p {
        margin: 0.25rem 0 0;
        color: var(--muted);
        font-size: 0.86rem;
      }
      .rep-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
        align-items: center;
        justify-content: space-between;
      }
      .rep-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
      }
      .rep-select {
        min-height: 40px;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 0.35rem 0.6rem;
        font: inherit;
        min-width: 160px;
      }
      .rep-year {
        min-width: 120px;
      }
      .rep-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--surface);
        cursor: pointer;
      }
      .rep-icon-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .rep-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        align-items: center;
      }
      .rep-actions > button {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 0.35rem 0.65rem;
        font: inherit;
        font-size: 0.82rem;
        font-weight: 600;
        background: #fff7ed;
        cursor: pointer;
      }
      .rep-actions > button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .rep-dd {
        position: relative;
      }
      .rep-dd-btn {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 0.35rem 0.65rem;
        font: inherit;
        font-size: 0.82rem;
        background: var(--surface);
        cursor: pointer;
      }
      .rep-dd-panel {
        display: none;
        position: absolute;
        right: 0;
        top: 100%;
        margin-top: 4px;
        min-width: 220px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 0.5rem;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
        z-index: 20;
      }
      .rep-dd:hover .rep-dd-panel,
      .rep-dd:focus-within .rep-dd-panel {
        display: block;
      }
      .rep-cb {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.82rem;
        padding: 0.2rem 0;
      }
      .rep-search {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.82rem;
      }
      .rep-search input {
        min-height: 34px;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 0.25rem 0.5rem;
        font: inherit;
        width: 160px;
      }
      .rep-err {
        color: #b91c1c;
        font-weight: 600;
      }
      .rep-table-wrap {
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: 10px;
        background: var(--surface);
      }
      .rep-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 900px;
        font-size: 0.86rem;
      }
      .rep-table th,
      .rep-table td {
        border-bottom: 1px solid var(--border);
        padding: 0.45rem 0.55rem;
        text-align: left;
      }
      .rep-table thead th {
        background: var(--bg-subtle);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .rep-empty {
        color: var(--muted);
        text-align: center;
        padding: 1.25rem !important;
      }
      .rep-foot {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.86rem;
        color: var(--muted);
      }
      .rep-pager {
        display: flex;
        align-items: center;
        gap: 0.35rem;
      }
      .rep-pager button {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 0.3rem 0.65rem;
        font: inherit;
        cursor: pointer;
        background: var(--surface);
      }
      .rep-pager button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .rep-page-num {
        font-weight: 700;
        padding: 0 0.35rem;
      }
      @media print {
        .no-print {
          display: none !important;
        }
        .rep-table-wrap {
          border: none;
        }
      }
    `,
  ],
})
export class ReportStudentsInfoComponent {
  readonly COL_META = COL_META;

  private readonly api = inject(ApiService);
  private readonly schoolRef = inject(SchoolRefService);

  readonly className = signal('');
  readonly yearFilter = signal('');
  readonly searchQuery = signal('');
  readonly loading = signal(false);
  readonly loadError = signal(false);
  readonly hasLoaded = signal(false);

  readonly allRows = signal<Student[]>([]);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);

  readonly colVisible = signal<Record<ColKey, boolean>>({
    sr: true,
    admissionId: true,
    studentName: true,
    fatherName: true,
    classCol: true,
    discount: true,
    admissionDate: true,
    dob: true,
    age: true,
    gender: true,
    birthForm: true,
  });

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

  readonly filteredRows = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    const list = this.allRows();
    if (!q) return list;
    return list.filter((s) => {
      const blob = [
        s.admission_no,
        s.full_name,
        fatherName(s),
        s.class_name,
        s.section,
        discountFeeLabel(s),
        admissionDateDisplay(s),
        dobDisplay(s),
        ageFromStudent(s),
        genderLabel(s),
        extraStr(s, 'birth_form_nic'),
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredRows().length / this.pageSize())),
  );

  readonly pagedRows = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.filteredRows().slice(start, start + this.pageSize());
  });

  readonly visibleColMeta = computed(() => COL_META.filter((c) => this.colVisible()[c.key]));

  readonly rangeFrom = computed(() =>
    this.filteredRows().length === 0 ? 0 : this.pageIndex() * this.pageSize() + 1,
  );

  readonly rangeTo = computed(() =>
    Math.min((this.pageIndex() + 1) * this.pageSize(), this.filteredRows().length),
  );

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

  maxColspan(): number {
    return Math.max(1, this.visibleColMeta().length);
  }

  canLoad(): boolean {
    return this.className().trim() !== '' && this.yearFilter().trim() !== '';
  }

  onSearch(v: string): void {
    this.searchQuery.set(v);
    this.pageIndex.set(0);
  }

  toggleCol(key: ColKey, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    this.colVisible.update((m) => ({ ...m, [key]: checked }));
  }

  load(): void {
    if (!this.canLoad()) return;
    this.loading.set(true);
    this.loadError.set(false);
    this.hasLoaded.set(true);
    this.pageIndex.set(0);
    this.api
      .listStudentsPage({
        className: this.className().trim(),
        academicYear: this.yearFilter().trim(),
        skip: 0,
        limit: 2000,
      })
      .pipe(
        catchError(() => {
          this.loadError.set(true);
          return of<StudentListPage>({ items: [], total: 0, skip: 0, limit: 2000 });
        }),
      )
      .subscribe({
        next: (page) => {
          this.allRows.set(page.items);
          this.loading.set(false);
        },
      });
  }

  cellValue(key: ColKey, s: Student, serialNo: number): string {
    switch (key) {
      case 'sr':
        return String(serialNo);
      case 'admissionId':
        return s.admission_no || '—';
      case 'studentName':
        return s.full_name || '—';
      case 'fatherName':
        return fatherName(s);
      case 'classCol':
        return classWithSection(s);
      case 'discount':
        return discountFeeLabel(s);
      case 'admissionDate':
        return admissionDateDisplay(s);
      case 'dob':
        return dobDisplay(s);
      case 'age':
        return ageFromStudent(s);
      case 'gender':
        return genderLabel(s);
      case 'birthForm':
        return extraStr(s, 'birth_form_nic') || '—';
      default:
        return '—';
    }
  }

  prev(): void {
    if (this.pageIndex() <= 0) return;
    this.pageIndex.update((i) => i - 1);
  }

  next(): void {
    if (this.pageIndex() >= this.totalPages() - 1) return;
    this.pageIndex.update((i) => i + 1);
  }

  private buildTsv(): string {
    const cols = this.visibleColMeta();
    const header = cols.map((c) => c.label).join('\t');
    const lines = this.filteredRows().map((s, i) =>
      cols.map((c) => this.cellValue(c.key, s, i + 1)).join('\t'),
    );
    return [header, ...lines].join('\n');
  }

  copyExport(): void {
    const t = this.buildTsv();
    void navigator.clipboard.writeText(t);
  }

  csvExport(): void {
    const cols = this.visibleColMeta();
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = cols.map((c) => esc(c.label)).join(',');
    const lines = this.filteredRows().map((s, i) =>
      cols.map((c) => esc(this.cellValue(c.key, s, i + 1))).join(','),
    );
    this.downloadBlob([header, ...lines].join('\n'), 'students-info-report.csv', 'text/csv;charset=utf-8');
  }

  excelExport(): void {
    const tsv = this.buildTsv();
    this.downloadBlob(tsv, 'students-info-report.xls', 'application/vnd.ms-excel;charset=utf-8');
  }

  printReport(): void {
    window.print();
  }

  private downloadBlob(body: string, name: string, mime: string): void {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
}
