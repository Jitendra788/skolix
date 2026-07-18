import { DecimalPipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import {
  ApiService,
  FeeStructureRead,
  SchoolClassRow,
  SchoolFeeHeadRow,
  SchoolFeeFrequencyRow,
} from '../core/api.service';
import { indiaAcademicYearLabel } from '../core/academic-year.util';
import { SchoolRefService } from '../core/school-ref.service';

@Component({
  selector: 'app-fee-structure',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  styleUrl: './fee-structure.component.scss',
  template: `
    <div class="fs-page">
      <nav class="fs-bc" aria-label="Breadcrumb">
        <span>General settings</span>
        <span class="fs-bc-sep">/</span>
        <span class="fs-bc-here">Fee structure</span>
      </nav>
      <header class="fs-head">
        <h1 class="fs-title">Fee structure</h1>
        <p class="fs-lede">
          Edit fee amounts <strong>one class at a time</strong>: pick a class, then set each fee head in a vertical list (same heads as
          <strong>Fees Particulars</strong>). All classes are saved together for the academic year.           Use <strong>Classes → All Classes</strong> and <strong>School setup</strong> for fee heads; use
          <strong>Fee collection</strong> under Accounts to post student ledgers.
        </p>
      </header>
      @if (err) {
        <p class="fs-alert fs-err">{{ err }}</p>
      }
      @if (ok) {
        <p class="fs-alert fs-ok">{{ ok }}</p>
      }
      <section class="fs-card">
        <h2 class="fs-filters-title">Filters</h2>
        <div class="fs-filters">
          <div class="fs-field fs-field-block">
            <span class="fs-field-label">Academic year</span>
            <p class="fs-ay-value">
              <strong>{{ academicYear }}</strong>
              <span class="fs-ay-note">India session (Apr–Mar), from today’s date — same rule as the server.</span>
            </p>
          </div>
          <label class="fs-field fs-field-block">
            <span class="fs-field-label">Class <span class="fs-req">(required)</span></span>
            <select
              class="fs-select fs-select-full"
              [(ngModel)]="selectedClassName"
              (ngModelChange)="onClassFilterChange()"
            >
              @if (!classes.length) {
                <option value="" disabled>No classes — add them in School setup</option>
              }
              @for (c of classes; track c.id) {
                <option [value]="c.name">{{ c.name }}</option>
              }
            </select>
          </label>
        </div>
        <p class="fs-hint">Default frequency for new rows: <strong>{{ defaultFreq || 'annual' }}</strong></p>
        <div class="fs-actions">
          <button type="button" class="btn primary" [disabled]="loading" (click)="loadMatrix()">
            {{ loading ? 'Loading…' : 'Reload' }}
          </button>
          <button type="button" class="btn primary" [disabled]="saving || loading || !canEdit" (click)="save()">
            {{ saving ? 'Saving…' : 'Save fee structure' }}
          </button>
        </div>
      </section>
      @if (!canEdit) {
        <p class="fs-muted">Add at least one class and one fee head under School setup to edit fee structure.</p>
      } @else if (!selectedClassName) {
        <p class="fs-muted">Select a class to edit amounts.</p>
      } @else {
        <section class="fs-card">
          <h2 class="fs-section-title">Fee heads — {{ selectedClassName }}</h2>
          <p class="fs-hint fs-hint-tight">Amounts apply only to this class for the year above. Saving updates every class in the school.</p>
          <ul class="fs-vertical-list" aria-label="Fee heads for selected class">
            @for (h of heads; track h.id) {
              <li class="fs-vertical-row">
                <div class="fs-vertical-row-inner">
                  <span class="fs-head-name">{{ h.name }}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    class="fs-num fs-num-full"
                    [ngModel]="amountFor(selectedClassName, h.name)"
                    (ngModelChange)="setAmount(selectedClassName, h.name, $event)"
                    [attr.aria-label]="'Amount for ' + h.name"
                  />
                </div>
              </li>
            }
          </ul>
          <div class="fs-subtotal">
            <span>Subtotal (this class)</span>
            <strong>{{ subtotalForSelectedClass() | number: '1.2-2' }}</strong>
          </div>
        </section>
      }
    </div>
  `,
})
export class FeeStructureComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly schoolRef = inject(SchoolRefService);

  /** Calendar academic year (no manual picker). */
  academicYear = '';
  heads: SchoolFeeHeadRow[] = [];
  classes: SchoolClassRow[] = [];
  /** Class whose fee heads are shown in the vertical editor. */
  selectedClassName = '';
  defaultFreq = '';
  private readonly amounts = new Map<string, number>();

  loading = false;
  saving = false;
  err = '';
  ok = '';

  get canEdit(): boolean {
    return this.classes.length > 0 && this.heads.length > 0 && !!this.academicYear.trim();
  }

  ngOnInit(): void {
    this.schoolRef.loadAll();
    forkJoin({
      ay: this.api.getCurrentAcademicYear().pipe(catchError(() => of(null))),
      heads: this.api.listSchoolFeeHeads().pipe(catchError(() => of<SchoolFeeHeadRow[]>([]))),
      freqs: this.api.listSchoolFeeFrequencies().pipe(catchError(() => of<SchoolFeeFrequencyRow[]>([]))),
    }).subscribe({
      next: ({ ay, heads, freqs }) => {
        this.heads = [...heads].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
        const fq = [...freqs].sort((a, b) => a.sort_order - b.sort_order);
        this.defaultFreq = fq[0]?.name ?? 'annual';
        /** Shown immediately; loadMatrix() refreshes from the same API. */
        this.academicYear = ay?.academic_year?.trim() || indiaAcademicYearLabel();
        this.loadMatrix();
      },
      error: () => {
        this.err = 'Could not load reference data.';
      },
    });
  }

  onClassFilterChange(): void {
    this.ok = '';
  }

  private ensureSelectedClass(): void {
    if (!this.classes.length) {
      this.selectedClassName = '';
      return;
    }
    if (!this.selectedClassName || !this.classes.some((c) => c.name === this.selectedClassName)) {
      this.selectedClassName = this.classes[0].name;
    }
  }

  subtotalForSelectedClass(): number {
    const cn = this.selectedClassName;
    if (!cn) return 0;
    return this.heads.reduce((sum, h) => sum + this.amountFor(cn, h.name), 0);
  }

  private key(className: string, feeHead: string): string {
    return `${className}\t${feeHead}`;
  }

  amountFor(className: string, feeHead: string): number {
    return this.amounts.get(this.key(className, feeHead)) ?? 0;
  }

  setAmount(className: string, feeHead: string, raw: number | string): void {
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, '')) || 0;
    this.amounts.set(this.key(className, feeHead), Math.max(0, n));
  }

  loadMatrix(): void {
    this.err = '';
    this.ok = '';
    this.loading = true;
    forkJoin({
      curAy: this.api.getCurrentAcademicYear().pipe(catchError(() => of(null))),
      classes: this.api.listSchoolClasses().pipe(catchError(() => of<SchoolClassRow[]>([]))),
    })
      .pipe(
        switchMap(({ curAy, classes }) => {
          const ay =
            (curAy?.academic_year || '').trim() || indiaAcademicYearLabel();
          return this.api.listFeeStructure(ay).pipe(
            map((structure) => ({ ay, structure, classes }))
          );
        })
      )
      .subscribe({
        next: ({ ay, structure, classes }) => {
          this.loading = false;
          this.academicYear = ay;
          this.classes = [...classes]
            .map((c) => ({ ...c, name: (c.name || '').trim() }))
            .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
          this.ensureSelectedClass();
          this.amounts.clear();
          for (const r of structure) {
            this.amounts.set(this.key(r.class_name, r.fee_head), r.amount);
          }
        },
        error: () => {
          this.loading = false;
          this.err = 'Could not load fee structure or classes.';
        },
      });
  }

  save(): void {
    this.err = '';
    this.ok = '';
    const ay = this.academicYear.trim();
    if (!this.canEdit) return;
    const cells = [];
    for (const c of this.classes) {
      for (const h of this.heads) {
        cells.push({
          class_name: c.name,
          fee_head: h.name,
          amount: this.amountFor(c.name, h.name),
          frequency: this.defaultFreq,
        });
      }
    }
    this.saving = true;
    this.api
      .saveFeeStructureBulk({ academic_year: ay, frequency: this.defaultFreq, cells })
      .pipe(catchError(() => of(null)))
      .subscribe({
        next: (rows) => {
          this.saving = false;
          if (!rows) {
            this.err = 'Save failed.';
            return;
          }
          this.ok = 'Fee structure saved.';
          this.loadMatrix();
        },
        error: () => {
          this.saving = false;
          this.err = 'Save failed.';
        },
      });
  }
}
