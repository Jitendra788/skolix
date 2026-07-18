import { DecimalPipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import {
  ApiService,
  FeeApplyStructureToClassResult,
  SchoolClassRow,
  StudentFeeLedger,
} from '../core/api.service';
import { indiaAcademicYearLabel } from '../core/academic-year.util';
import { SchoolRefService } from '../core/school-ref.service';

@Component({
  selector: 'app-fee-collection',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  styleUrl: './fee-collection.component.scss',
  template: `
    <div class="fc-page">
      <nav class="fc-bc" aria-label="Breadcrumb">
        <span>Accounts</span>
        <span class="fc-bc-sep">/</span>
        <span class="fc-bc-here">Fee collection</span>
      </nav>
      <header class="fc-head">
        <h1 class="fc-title">Fee collection</h1>
        <p class="fc-lede">
          Create student fee ledgers from the <strong>fee structure</strong> matrix for a class, then record concessions
          and payments. Academic year is <strong>April–March</strong> (automatic). Replace is blocked when a student already
          has collections recorded. Institute <strong>discount type</strong> is enforced from general settings.
        </p>
      </header>

      @if (err) {
        <p class="fc-alert fc-err">{{ err }}</p>
      }
      @if (ok) {
        <p class="fc-alert fc-ok">{{ ok }}</p>
      }

      <section class="fc-card">
        <h2>Apply fee structure to class</h2>
        <div class="fc-grid">
          <label class="fc-field">
            <span>Class</span>
            <select class="input" [(ngModel)]="className" (ngModelChange)="onClassChange()">
              @for (c of classes; track c.id) {
                <option [value]="c.name">{{ c.name }}</option>
              }
            </select>
          </label>
          <div class="fc-field">
            <span>Academic year</span>
            <p class="fc-ay-readonly">
              <strong>{{ academicYear }}</strong>
              <span class="fc-ay-note">Apr–Mar (auto)</span>
            </p>
          </div>
          <label class="fc-field">
            <span>Consolidated due date</span>
            <input class="input" type="date" [(ngModel)]="dueDate" />
          </label>
          <label class="fc-field" style="flex-direction: row; align-items: center; gap: 0.5rem;">
            <input type="checkbox" [(ngModel)]="replaceExisting" />
            <span>Replace existing ledgers (only if no payments)</span>
          </label>
        </div>
        <div class="fc-row-actions">
          <button type="button" class="btn primary" [disabled]="applying || !canApply" (click)="applyStructure()">
            {{ applying ? 'Applying…' : 'Apply to class roster' }}
          </button>
          <button type="button" class="btn" [disabled]="loading || !canApply" (click)="reloadLedger()">
            {{ loading ? 'Loading…' : 'Refresh ledger list' }}
          </button>
        </div>
        @if (lastApply) {
          <p class="fc-muted">
            Last apply: created {{ lastApply.created }}, replaced {{ lastApply.replaced }}, skipped
            {{ lastApply.skipped }}, skipped (had payments) {{ lastApply.skipped_with_payments }} — gross per student
            {{ lastApply.per_student_gross | number: '1.2-2' }}.
          </p>
        }
      </section>

      <section class="fc-card">
        <h2>Class ledger</h2>
        @if (!canApply) {
          <p class="fc-muted">Choose a class to load fee rows.</p>
        } @else if (loading) {
          <p class="fc-muted">Loading…</p>
        } @else if (!rows.length) {
          <p class="fc-muted">No student fee records for this class and year. Run apply above after saving fee structure.</p>
        } @else {
          <div class="fc-table-wrap">
            <table class="fc-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Admission</th>
                  <th>Sec.</th>
                  <th class="fc-num">Gross</th>
                  <th class="fc-num">Discount</th>
                  <th class="fc-num">Paid</th>
                  <th class="fc-num">Due</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (r of rows; track r.id) {
                  <tr>
                    <td>{{ r.student_name }}</td>
                    <td>{{ r.admission_no }}</td>
                    <td>{{ r.section || '—' }}</td>
                    <td class="fc-num">{{ r.gross_total ?? 0 | number: '1.2-2' }}</td>
                    <td class="fc-num">{{ r.discount_amount | number: '1.2-2' }}</td>
                    <td class="fc-num">{{ r.total_paid | number: '1.2-2' }}</td>
                    <td class="fc-num">{{ r.total_due | number: '1.2-2' }}</td>
                    <td>
                      <button type="button" class="btn" (click)="toggleRow(r)">
                        {{ expandedId === r.id ? 'Close' : 'Collect / discount' }}
                      </button>
                    </td>
                  </tr>
                  @if (expandedId === r.id) {
                    <tr>
                      <td colspan="8">
                        <div class="fc-panel">
                          <h3>Concession (total discount)</h3>
                          <div class="fc-inline">
                            <label class="fc-field">
                              <span>Amount</span>
                              <input class="input" type="number" min="0" step="0.01" [(ngModel)]="discAmount" />
                            </label>
                            <label class="fc-field grow">
                              <span>Note</span>
                              <input class="input" type="text" [(ngModel)]="discNote" maxlength="240" />
                            </label>
                            <button type="button" class="btn primary" [disabled]="rowBusy" (click)="saveConcession(r.id)">
                              Save concession
                            </button>
                          </div>
                          <h3 style="margin-top: 1rem">Payment</h3>
                          <div class="fc-inline">
                            <label class="fc-field">
                              <span>Amount received</span>
                              <input class="input" type="number" min="0" step="0.01" [(ngModel)]="payAmount" />
                            </label>
                            <label class="fc-field">
                              <span>Extra concession (same receipt)</span>
                              <input class="input" type="number" min="0" step="0.01" [(ngModel)]="payExtraConcession" />
                            </label>
                            <label class="fc-field grow">
                              <span>Note</span>
                              <input class="input" type="text" [(ngModel)]="payNote" maxlength="240" />
                            </label>
                            <button type="button" class="btn primary" [disabled]="rowBusy" (click)="postPayment(r.id)">
                              Post payment
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </div>
  `,
})
export class FeeCollectionComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly schoolRef = inject(SchoolRefService);

  classes: SchoolClassRow[] = [];
  className = '';
  academicYear = '';
  replaceExisting = false;
  dueDate = '';

  rows: StudentFeeLedger[] = [];
  loading = false;
  applying = false;
  err = '';
  ok = '';
  lastApply: FeeApplyStructureToClassResult | null = null;

  expandedId: number | null = null;
  discAmount = 0;
  discNote = '';
  payAmount = 0;
  payExtraConcession = 0;
  payNote = '';
  rowBusy = false;

  get canApply(): boolean {
    return !!this.className.trim();
  }

  ngOnInit(): void {
    this.schoolRef.loadAll();
    const today = new Date();
    this.dueDate = today.toISOString().slice(0, 10);
    forkJoin({
      ay: this.api.getCurrentAcademicYear().pipe(catchError(() => of(null))),
      classes: this.api.listSchoolClasses().pipe(catchError(() => of<SchoolClassRow[]>([]))),
    }).subscribe({
      next: ({ ay, classes }) => {
        this.academicYear = ay?.academic_year?.trim() || indiaAcademicYearLabel();
        this.classes = [...classes]
          .map((c) => ({ ...c, name: (c.name || '').trim() }))
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
        if (!this.className && this.classes.length) this.className = this.classes[0].name;
        this.reloadLedger();
      },
      error: () => {
        this.err = 'Could not load classes or academic year.';
      },
    });
  }

  private syncClassesFromRef(): void {
    const fromRef = [...this.schoolRef.classes()];
    if (fromRef.length) {
      this.classes = fromRef
        .map((c) => ({ ...c, name: (c.name || '').trim() }))
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
      if (this.className && !this.classes.some((c) => c.name === this.className)) {
        this.className = this.classes[0]?.name ?? '';
      }
    }
  }

  onClassChange(): void {
    this.syncClassesFromRef();
    this.err = '';
    this.ok = '';
    this.expandedId = null;
    this.reloadLedger();
  }

  reloadLedger(): void {
    if (!this.canApply) {
      this.rows = [];
      return;
    }
    this.loading = true;
    this.err = '';
    this.api
      .getCurrentAcademicYear()
      .pipe(
        catchError(() => of(null)),
        map((cur) => (cur?.academic_year || '').trim() || indiaAcademicYearLabel()),
        switchMap((ayLabel) => {
          this.academicYear = ayLabel;
          return this.api.listStudentFees({
            className: this.className.trim(),
            academicYear: ayLabel,
          });
        }),
        catchError(() => of(null))
      )
      .subscribe({
        next: (list) => {
          this.loading = false;
          if (!list) {
            this.err = 'Could not load student fees.';
            this.rows = [];
            return;
          }
          this.rows = list;
        },
        error: () => {
          this.loading = false;
          this.err = 'Could not load student fees.';
        },
      });
  }

  applyStructure(): void {
    if (!this.canApply || this.applying) return;
    this.err = '';
    this.ok = '';
    this.applying = true;
    this.api
      .getCurrentAcademicYear()
      .pipe(
        catchError(() => of(null)),
        switchMap((cur) => {
          const ay = (cur?.academic_year || '').trim() || indiaAcademicYearLabel();
          this.academicYear = ay;
          return this.api.applyFeeStructureToClass({
            class_name: this.className.trim(),
            academic_year: ay,
            replace_existing: this.replaceExisting,
            consolidated_due_date: this.dueDate?.trim() || null,
          });
        }),
        catchError(() => of(null))
      )
      .subscribe({
        next: (res) => {
          this.applying = false;
          if (!res) {
            this.err = 'Apply failed. Ensure fee structure has amounts for this class and year.';
            return;
          }
          this.lastApply = res;
          this.ok = 'Fee structure applied to class roster.';
          this.reloadLedger();
        },
        error: () => {
          this.applying = false;
          this.err = 'Apply failed.';
        },
      });
  }

  toggleRow(r: StudentFeeLedger): void {
    if (this.expandedId === r.id) {
      this.expandedId = null;
      return;
    }
    this.expandedId = r.id;
    this.discAmount = r.discount_amount;
    this.discNote = '';
    this.payAmount = 0;
    this.payExtraConcession = 0;
    this.payNote = '';
  }

  saveConcession(studentFeeId: number): void {
    this.rowBusy = true;
    this.err = '';
    this.ok = '';
    this.api
      .updateStudentFeeConcession(studentFeeId, {
        discount_amount: this.discAmount,
        note: this.discNote,
      })
      .pipe(catchError(() => of(null)))
      .subscribe({
        next: (row) => {
          this.rowBusy = false;
          if (!row) {
            this.err = 'Could not update concession (check discount type and limits).';
            return;
          }
          this.ok = 'Concession saved.';
          this.patchRow(row);
        },
        error: () => {
          this.rowBusy = false;
          this.err = 'Could not update concession.';
        },
      });
  }

  postPayment(studentFeeId: number): void {
    this.rowBusy = true;
    this.err = '';
    this.ok = '';
    this.api
      .applyStudentFeePayment(studentFeeId, {
        amount: this.payAmount,
        additional_concession: this.payExtraConcession,
        note: this.payNote,
      })
      .pipe(catchError(() => of(null)))
      .subscribe({
        next: (res) => {
          this.rowBusy = false;
          if (!res) {
            this.err = 'Payment failed. Enter a positive amount and/or extra concession.';
            return;
          }
          this.ok =
            res.amount_unapplied > 0.009
              ? `Payment posted. Unapplied remainder: ${res.amount_unapplied.toFixed(2)}.`
              : 'Payment posted.';
          this.patchRow(res.student_fee);
          this.payAmount = 0;
          this.payExtraConcession = 0;
          this.payNote = '';
          this.discAmount = res.student_fee.discount_amount;
        },
        error: () => {
          this.rowBusy = false;
          this.err = 'Payment failed.';
        },
      });
  }

  private patchRow(row: StudentFeeLedger): void {
    this.rows = this.rows.map((x) => (x.id === row.id ? row : x));
  }
}
