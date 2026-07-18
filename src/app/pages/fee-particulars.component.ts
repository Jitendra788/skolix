import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import {
  ApiService,
  FeeParticularRowRead,
  Student,
} from '../core/api.service';
import { indiaAcademicYearLabel } from '../core/academic-year.util';
import { SchoolRefService } from '../core/school-ref.service';

type FeeScope = 'class' | 'student';

interface EditRow {
  fee_head_id: number;
  particular_key: string;
  label: string;
  amount_text: string;
  readonly_amount: boolean;
  source: string;
}

@Component({
  selector: 'app-fee-particulars',
  standalone: true,
  imports: [FormsModule],
  styleUrl: './fee-particulars.component.scss',
  template: `
    <div class="fp-page">
      <nav class="fp-breadcrumb" aria-label="Breadcrumb">
        <span>General settings</span>
        <span class="fp-bc-sep">/</span>
        <span class="fp-bc-here">Fees Particulars</span>
      </nav>

      <header class="fp-header">
        <h1 class="fp-title">Fees Particulars</h1>
        <p class="fp-lede">
          Uses the <strong>same fee heads</strong> as <strong>School setup</strong> and the <strong>Fee structure</strong> matrix. Class-wise
          edits write the same <code>fee_structure</code> rows (by class, fee head name, academic year); student-wise rows
          add overrides on top. Academic year follows the <strong>April–March</strong> calendar automatically. Reload after
          changing class or student to see saved values.
        </p>
      </header>

      @if (err) {
        <p class="fp-alert fp-alert-err">{{ err }}</p>
      }
      @if (ok) {
        <p class="fp-alert fp-alert-ok">{{ ok }}</p>
      }

      <section class="fp-card">
        <h2 class="fp-card-title">Filters</h2>
        <div class="fp-filters">
          <label class="fp-float">
            <span class="fp-float-label">Fee particulars for</span>
            <select class="fp-input" [(ngModel)]="scope" (ngModelChange)="onScopeChange()">
              <option value="class">Specific class</option>
              <option value="student">Specific student</option>
            </select>
          </label>
          @if (scope === 'class') {
            <label class="fp-float">
              <span class="fp-float-label">Select class</span>
              <select class="fp-input" [(ngModel)]="className" (ngModelChange)="loadSheet()">
                @for (c of schoolRef.classes(); track c.id) {
                  <option [value]="c.name">{{ c.name }}</option>
                }
              </select>
            </label>
          } @else {
            <label class="fp-float">
              <span class="fp-float-label">Select student</span>
              <select class="fp-input" [(ngModel)]="studentId" (ngModelChange)="loadSheet()">
                @for (s of students; track s.id) {
                  <option [ngValue]="s.id">{{ s.full_name }} — {{ s.admission_no }} ({{ s.class_name }})</option>
                }
              </select>
            </label>
          }
          <div class="fp-float fp-ay-block">
            <span class="fp-float-label">Academic year</span>
            <p class="fp-ay-readonly">
              <strong>{{ academicYear }}</strong>
              <span class="fp-ay-note">Apr–Mar (auto)</span>
            </p>
          </div>
        </div>
        <div class="fp-actions">
          <button type="button" class="btn primary" [disabled]="loading" (click)="loadSheet()">
            {{ loading ? 'Loading…' : 'Reload' }}
          </button>
          <button
            type="button"
            class="btn primary"
            [disabled]="saving || loading || !editRows.length"
            (click)="save()"
          >
            {{ saving ? 'Saving…' : 'Save particulars' }}
          </button>
        </div>
        @if (hint) {
          <p class="fp-hint">{{ hint }}</p>
        }
      </section>

      <section class="fp-card fp-rows-card">
        <h2 class="fp-card-title">Particulars</h2>
        @if (loading && !editRows.length) {
          <p class="fp-muted">Loading…</p>
        } @else if (!editRows.length) {
          <p class="fp-muted">Select filters above to load fee particulars.</p>
        } @else {
          <div class="fp-row-grid fp-row-head" aria-hidden="true">
            <span>Particular label</span>
            <span>Prefix amount</span>
            <span></span>
          </div>
          @for (row of editRows; track row.fee_head_id) {
            <div class="fp-row-grid">
              <label class="fp-float fp-float-grow">
                <span class="fp-float-label fp-label-particular">Particular label</span>
                <input type="text" class="fp-input" [value]="row.label" readonly />
              </label>
              <label class="fp-float fp-float-grow">
                <span class="fp-float-label fp-label-amount">Prefix amount</span>
                <input
                  type="text"
                  class="fp-input"
                  [class.fp-input-fixed]="row.readonly_amount"
                  [(ngModel)]="row.amount_text"
                  [disabled]="row.readonly_amount"
                  [attr.aria-readonly]="row.readonly_amount"
                />
              </label>
              <div class="fp-source">
                @if (!row.readonly_amount) {
                  <span class="fp-source-pill">{{ sourceLabel(row.source) }}</span>
                } @else {
                  <span class="fp-source-pill fp-source-fixed">Fixed</span>
                }
              </div>
            </div>
          }
        }
      </section>
    </div>
  `,
})
export class FeeParticularsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly schoolRef = inject(SchoolRefService);

  scope: FeeScope = 'class';
  className = '';
  studentId: number | null = null;
  academicYear = '';

  students: Student[] = [];
  editRows: EditRow[] = [];

  loading = false;
  saving = false;
  err = '';
  ok = '';
  hint = '';

  ngOnInit(): void {
    this.schoolRef.loadAll();
    forkJoin({
      ay: this.api.getCurrentAcademicYear().pipe(catchError(() => of(null))),
      roster: this.api.listStudents().pipe(catchError(() => of<Student[]>([]))),
    }).subscribe({
      next: ({ ay, roster }) => {
        this.students = roster.sort((a, b) =>
          `${a.class_name} ${a.full_name}`.localeCompare(`${b.class_name} ${b.full_name}`)
        );
        this.academicYear = ay?.academic_year?.trim() || indiaAcademicYearLabel();
        const classes = this.schoolRef.classes();
        if (this.scope === 'class' && classes.length && !this.className) {
          this.className = classes[0].name;
        }
        if (this.scope === 'student' && this.students.length && !this.studentId) {
          this.studentId = this.students[0].id;
        }
        this.loadSheet();
      },
      error: () => {
        this.err = 'Could not load reference data.';
      },
    });
  }

  onScopeChange(): void {
    this.err = '';
    this.ok = '';
    const classes = this.schoolRef.classes();
    if (this.scope === 'class') {
      this.studentId = null;
      if (classes.length && !classes.some((c) => c.name === this.className)) {
        this.className = classes[0]?.name ?? '';
      }
    } else {
      this.className = '';
      if (this.students.length && !this.students.some((s) => s.id === this.studentId)) {
        this.studentId = this.students[0]?.id ?? null;
      }
    }
    this.loadSheet();
  }

  loadSheet(): void {
    this.err = '';
    this.ok = '';
    if (this.scope === 'class') {
      const cn = this.className.trim();
      if (!cn) {
        this.hint = 'Choose a class to load fee particulars.';
        this.editRows = [];
        return;
      }
    } else if (!this.studentId || this.studentId <= 0) {
      this.hint = 'Choose a student to load fee particulars.';
      this.editRows = [];
      return;
    }

    this.loading = true;
    this.api
      .getCurrentAcademicYear()
      .pipe(
        catchError(() => of(null)),
        map((cur) => (cur?.academic_year || '').trim() || indiaAcademicYearLabel()),
        switchMap((ay) => {
          this.academicYear = ay;
          if (this.scope === 'class') {
            return this.api.getFeeParticularsSheet({
              scope: 'class',
              className: this.className.trim(),
              academicYear: ay,
            });
          }
          return this.api.getFeeParticularsSheet({
            scope: 'student',
            studentId: this.studentId!,
            academicYear: ay,
          });
        }),
        catchError(() => of(null))
      )
      .subscribe({
        next: (s) => {
          this.loading = false;
          if (!s) {
            this.err = 'Could not load fee particulars.';
            this.editRows = [];
            return;
          }
          this.applySheetRows(s.rows);
          this.setHintFromRows(s.rows);
        },
        error: () => {
          this.loading = false;
          this.err = 'Could not load fee particulars.';
        },
      });
  }

  private applySheetRows(rows: FeeParticularRowRead[]): void {
    this.editRows = rows.map((r) => ({
      fee_head_id: r.fee_head_id,
      particular_key: r.particular_key ?? '',
      label: r.label,
      amount_text: r.amount_text,
      readonly_amount: r.readonly_amount,
      source: r.source,
    }));
  }

  private setHintFromRows(rows: FeeParticularRowRead[]): void {
    const hasClass = rows.some((r) => r.source === 'class_structure');
    const hasStudent = rows.some((r) => r.source === 'student_override');
    if (this.scope === 'student' && (hasClass || hasStudent)) {
      this.hint =
        hasStudent && hasClass
          ? 'Showing saved values: student overrides where set, otherwise class fee structure.'
          : hasStudent
            ? 'Values include student-specific fee particulars already on file.'
            : 'No student overrides yet — amounts follow the class fee structure or template defaults.';
    } else if (this.scope === 'class' && hasClass) {
      this.hint = 'Class fee amounts on file are shown below. Edit and save to update.';
    } else {
      this.hint = 'Template defaults are shown until you save amounts for this selection.';
    }
  }

  save(): void {
    this.err = '';
    this.ok = '';
    const ay = this.academicYear.trim() || indiaAcademicYearLabel();
    this.academicYear = ay;
    const rows = this.editRows
      .filter((r) => r.particular_key && !r.readonly_amount)
      .map((r) => ({
        particular_key: r.particular_key,
        amount_text: r.amount_text,
      }));
    if (this.scope === 'class') {
      const cn = this.className.trim();
      if (!cn) {
        this.err = 'Select a class.';
        return;
      }
      this.saving = true;
      this.api
        .saveFeeParticularsSheet({
          scope: 'class',
          class_name: cn,
          academic_year: ay,
          rows,
        })
        .pipe(catchError(() => of(null)))
        .subscribe({
          next: (s) => {
            this.saving = false;
            if (!s) {
              this.err = 'Save failed.';
              return;
            }
            this.applySheetRows(s.rows);
            this.setHintFromRows(s.rows);
            this.ok = 'Fee particulars saved.';
          },
          error: () => {
            this.saving = false;
            this.err = 'Save failed.';
          },
        });
      return;
    }
    if (!this.studentId) {
      this.err = 'Select a student.';
      return;
    }
    this.saving = true;
    this.api
      .saveFeeParticularsSheet({
        scope: 'student',
        student_id: this.studentId,
        academic_year: ay,
        rows,
      })
      .pipe(catchError(() => of(null)))
      .subscribe({
        next: (s) => {
          this.saving = false;
          if (!s) {
            this.err = 'Save failed.';
            return;
          }
          this.applySheetRows(s.rows);
          this.setHintFromRows(s.rows);
          this.ok = 'Fee particulars saved.';
        },
        error: () => {
          this.saving = false;
          this.err = 'Save failed.';
        },
      });
  }

  sourceLabel(source: string): string {
    switch (source) {
      case 'class_structure':
        return 'From class';
      case 'student_override':
        return 'Student override';
      case 'template':
        return 'Template';
      default:
        return source;
    }
  }
}
