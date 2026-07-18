import { Injectable, inject, signal } from '@angular/core';
import { ReplaySubject, catchError, forkJoin, of } from 'rxjs';
import {
  ApiService,
  CurrentAcademicYear,
  SchoolAcademicYearRow,
  SchoolClassRow,
  SchoolFeeFrequencyRow,
  SchoolFeeHeadRow,
  Student,
} from './api.service';
import { indiaAcademicYearLabel } from './academic-year.util';

/**
 * Cached school master data (classes, years, fee heads, frequencies) and roster slices per class.
 * Default academic year: API calendar (India Apr–Mar), else client-side calculation — not the manual “current” flag.
 */
@Injectable({ providedIn: 'root' })
export class SchoolRefService {
  private readonly api = inject(ApiService);

  private readonly _classes = signal<SchoolClassRow[]>([]);
  private readonly _years = signal<SchoolAcademicYearRow[]>([]);
  private readonly _feeHeads = signal<SchoolFeeHeadRow[]>([]);
  private readonly _feeFrequencies = signal<SchoolFeeFrequencyRow[]>([]);
  private readonly _studentsByClass = signal<Map<string, Student[]>>(new Map());
  private readonly _defaultAcademicYear = signal<string>('');
  private readonly _defaultAcademicYearLoaded$ = new ReplaySubject<string>(1);

  readonly classes = this._classes.asReadonly();
  readonly academicYears = this._years.asReadonly();
  readonly feeHeads = this._feeHeads.asReadonly();
  readonly feeFrequencies = this._feeFrequencies.asReadonly();
  /** Calendar-based academic year (e.g. 2025-26). Updated whenever loadAll() completes. */
  readonly defaultAcademicYear = this._defaultAcademicYear.asReadonly();

  /** Emits once the default academic year is known (after first successful loadAll). */
  afterDefaultAcademicYearLoaded() {
    return this._defaultAcademicYearLoaded$.asObservable();
  }

  loadAll(): void {
    forkJoin({
      c: this.api.listSchoolClasses().pipe(catchError(() => of<SchoolClassRow[]>([]))),
      y: this.api
        .listSchoolAcademicYears()
        .pipe(catchError(() => of<SchoolAcademicYearRow[]>([]))),
      cur: this.api
        .getCurrentAcademicYear()
        .pipe(catchError(() => of<CurrentAcademicYear>({ academic_year: '', as_of_date: '' }))),
      fh: this.api
        .listSchoolFeeHeads()
        .pipe(catchError(() => of<SchoolFeeHeadRow[]>([]))),
      fq: this.api
        .listSchoolFeeFrequencies()
        .pipe(catchError(() => of<SchoolFeeFrequencyRow[]>([]))),
    }).subscribe({
      next: ({ c, y, cur, fh, fq }) => {
        this._classes.set(c);
        this._years.set(y);
        this._feeHeads.set(fh);
        this._feeFrequencies.set(fq);
        const fromApi = (cur.academic_year || '').trim();
        const label = fromApi || indiaAcademicYearLabel();
        this._defaultAcademicYear.set(label);
        this._defaultAcademicYearLoaded$.next(label);
      },
    });
  }

  /** First fee head by sort order (reference data). */
  preferredFeeHead(): string {
    const list = [...this._feeHeads()].sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );
    return list[0]?.name ?? '';
  }

  /** First frequency by sort order (reference data). */
  preferredFrequency(): string {
    const list = [...this._feeFrequencies()].sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );
    return list[0]?.name ?? 'Annual';
  }

  invalidateRosterCache(): void {
    this._studentsByClass.set(new Map());
  }

  ensureStudentsForClass(className: string): void {
    const c = className.trim();
    if (!c) return;
    const m = this._studentsByClass();
    if (m.has(c)) return;
    this.api.listStudents({ className: c }).subscribe((list) => {
      const next = new Map(this._studentsByClass());
      next.set(c, list);
      this._studentsByClass.set(next);
    });
  }

  rosterFor(className: string): Student[] {
    const c = className.trim();
    if (!c) return [];
    return this._studentsByClass().get(c) ?? [];
  }
}
