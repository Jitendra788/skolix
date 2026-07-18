import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { academicYearLabelForIsoDate } from '../core/academic-year.util';
import { ApiService, Student, StudentListPage, StudentPayload } from '../core/api.service';
import { SECTION_LETTERS } from '../core/section-options';
import { SchoolRefService } from '../core/school-ref.service';

type EditDraft = {
  id: number;
  admission_no: string;
  full_name: string;
  class_name: string;
  section: string;
  parent_phone: string;
  parent_name: string;
  date_of_birth: string;
  gender: string;
  admission_extras: Record<string, unknown>;
};

@Component({
  selector: 'app-all-students',
  standalone: true,
  imports: [FormsModule, RouterLink, NgTemplateOutlet],
  templateUrl: './all-students.component.html',
  styleUrls: ['./pages-shared.scss', './all-students.component.scss'],
})
export class AllStudentsComponent {
  private readonly api = inject(ApiService);
  readonly schoolRef = inject(SchoolRefService);

  readonly sectionLetters = [...SECTION_LETTERS];

  readonly students = signal<Student[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal(false);
  readonly hasAttemptedLoad = signal(false);

  readonly totalCount = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(25);
  readonly pageSizeOptions: readonly number[] = [10, 25, 50, 100];

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalCount() / this.pageSize())),
  );

  readonly showingFrom = computed(() =>
    this.totalCount() === 0 ? 0 : this.pageIndex() * this.pageSize() + 1,
  );

  readonly showingTo = computed(() =>
    Math.min((this.pageIndex() + 1) * this.pageSize(), this.totalCount()),
  );

  readonly viewMode = signal<'table' | 'list'>('table');
  readonly classFilter = signal('');
  readonly yearFilter = signal('');
  /** `*` = all sections; `A`/`B`/… = one section. */
  readonly sectionFilter = signal('');
  readonly searchQuery = signal('');

  /** At most one expanded row/card at a time to save space. */
  readonly expandedId = signal<number | null>(null);
  readonly editingId = signal<number | null>(null);
  readonly draft = signal<EditDraft | null>(null);
  readonly savingEdit = signal(false);
  readonly editError = signal('');

  /** Shown explicitly in accordion summary; omitted from the generic extras list below. */
  private readonly accordionSummaryExtraKeys = new Set<string>([
    'date_of_admission',
    'religion',
    'blood_group',
    'previous_board_roll',
    'father_mobile',
    'mother_mobile',
    'address',
  ]);

  private readonly extraKeyLabels: Record<string, string> = {
    date_of_admission: 'Date of admission',
    discount_fee_percent: 'Discount (%)',
    birth_form_nic: 'Birth form / NIC',
    orphan: 'Orphan student',
    caste: 'Caste',
    osc: 'OSC',
    identification_mark: 'Identification mark',
    previous_school: 'Previous school',
    religion: 'Religion',
    blood_group: 'Blood group',
    previous_board_roll: 'Previous board roll no.',
    family: 'Family',
    disease: 'Medical note',
    additional_note: 'Additional note',
    total_siblings: 'Total siblings',
    address: 'Address',
    father_name: 'Father name',
    father_national_id: 'Father national ID',
    father_occupation: 'Father occupation',
    father_education: 'Father education',
    father_mobile: 'Father mobile',
    father_profession: 'Father profession',
    father_income: 'Father income',
    mother_name: 'Mother name',
    mother_national_id: 'Mother national ID',
    mother_occupation: 'Mother occupation',
    mother_education: 'Mother education',
    mother_mobile: 'Mother mobile',
    mother_profession: 'Mother profession',
    mother_income: 'Mother income',
  };

  readonly yearOptions = computed(() => {
    const fromSchool = this.schoolRef
      .academicYears()
      .map((y) => (y.label || '').trim())
      .filter(Boolean);
    const def = (this.schoolRef.defaultAcademicYear() || '').trim();
    const set = new Set<string>(fromSchool);
    if (def) {
      set.add(def);
    }
    return [...set].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  });

  readonly canLoad = computed(() => {
    return (
      this.yearFilter().trim() !== '' &&
      this.classFilter().trim() !== '' &&
      this.sectionFilter() !== ''
    );
  });

  constructor() {
    this.schoolRef.afterDefaultAcademicYearLoaded().subscribe(() => {
      this.selectDefaultAcademicYear();
    });
    // If loadAll already finished before this page opened, still pick a year for the dropdown.
    queueMicrotask(() => this.selectDefaultAcademicYear());
  }

  /** Prefer the school's marked "current" year, then calendar default — matches seeded data. */
  private selectDefaultAcademicYear(): void {
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

  loadStudents(): void {
    if (!this.canLoad()) return;
    this.pageIndex.set(0);
    this.fetchStudentPage();
  }

  goPrevPage(): void {
    if (this.pageIndex() <= 0 || this.loading()) return;
    this.pageIndex.update((i) => i - 1);
    this.fetchStudentPage();
  }

  goNextPage(): void {
    if (this.loading()) return;
    if (this.pageIndex() >= this.totalPages() - 1) return;
    this.pageIndex.update((i) => i + 1);
    this.fetchStudentPage();
  }

  onPageSizeChange(raw: number): void {
    const n = Number(raw);
    if (!this.pageSizeOptions.includes(n)) return;
    this.pageSize.set(n);
    this.pageIndex.set(0);
    if (this.hasAttemptedLoad() && this.canLoad()) {
      this.fetchStudentPage();
    }
  }

  private fetchStudentPage(): void {
    if (!this.canLoad()) return;
    this.loading.set(true);
    this.loadError.set(false);
    this.hasAttemptedLoad.set(true);
    this.collapseAll();
    const sec = this.sectionFilter().trim();
    const qv = this.searchQuery().trim();
    this.api
      .listStudentsPage({
        className: this.classFilter().trim(),
        section: sec === '*' ? undefined : sec,
        academicYear: this.yearFilter().trim(),
        q: qv || undefined,
        skip: this.pageIndex() * this.pageSize(),
        limit: this.pageSize(),
      })
      .pipe(
        catchError(() => {
          this.loadError.set(true);
          this.students.set([]);
          this.totalCount.set(0);
          return of<StudentListPage>({
            items: [],
            total: 0,
            skip: 0,
            limit: this.pageSize(),
          });
        }),
      )
      .subscribe({
        next: (page) => {
          this.students.set(page.items);
          this.totalCount.set(page.total);
          this.loading.set(false);
        },
      });
  }

  admissionDateIso(s: Student): string {
    const ex = s.admission_extras;
    if (!ex || typeof ex !== 'object') return '';
    const v = (ex as Record<string, unknown>)['date_of_admission'];
    return typeof v === 'string' ? v.trim() : '';
  }

  sessionYearRaw(s: Student): string | null {
    return academicYearLabelForIsoDate(this.admissionDateIso(s));
  }

  sessionYearLabel(s: Student): string {
    return this.sessionYearRaw(s) ?? '—';
  }

  extraStr(s: Student, key: string): string {
    const ex = s.admission_extras;
    if (!ex || typeof ex !== 'object') return '';
    const v = (ex as Record<string, unknown>)[key];
    if (v == null) return '';
    return String(v).trim();
  }

  admissionDateDisplay(s: Student): string {
    const iso = this.admissionDateIso(s);
    if (!iso) return '—';
    return iso.length >= 10 ? iso.slice(0, 10) : iso;
  }

  truncateCell(text: string, max: number): string {
    const t = (text || '').trim();
    if (!t) return '—';
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
  }

  setView(mode: 'table' | 'list'): void {
    this.viewMode.set(mode);
    this.collapseAll();
  }

  isExpanded(id: number): boolean {
    return this.expandedId() === id;
  }

  toggleExpand(id: number): void {
    if (this.expandedId() === id) {
      this.expandedId.set(null);
      this.clearEdit();
    } else {
      this.clearEdit();
      this.expandedId.set(id);
    }
  }

  collapseAll(): void {
    this.expandedId.set(null);
    this.clearEdit();
  }

  startEdit(s: Student): void {
    this.expandedId.set(s.id);
    this.editingId.set(s.id);
    const ex = s.admission_extras;
    const extras =
      ex && typeof ex === 'object' && !Array.isArray(ex)
        ? { ...(ex as Record<string, unknown>) }
        : {};
    this.draft.set({
      id: s.id,
      admission_no: s.admission_no ?? '',
      full_name: s.full_name ?? '',
      class_name: s.class_name ?? '',
      section: s.section ?? '',
      parent_phone: s.parent_phone ?? '',
      parent_name: s.parent_name ?? '',
      date_of_birth: s.date_of_birth ?? '',
      gender: s.gender ?? '',
      admission_extras: extras,
    });
    this.editError.set('');
  }

  clearEdit(): void {
    this.editingId.set(null);
    this.draft.set(null);
    this.editError.set('');
  }

  cancelEdit(): void {
    this.clearEdit();
  }

  patchDraft<K extends keyof Omit<EditDraft, 'id' | 'admission_extras'>>(
    field: K,
    value: string
  ): void {
    const d = this.draft();
    if (!d) return;
    this.draft.set({ ...d, [field]: value });
  }

  extraDisplayRows(s: Student): { label: string; value: string }[] {
    const ex = s.admission_extras;
    if (!ex || typeof ex !== 'object') return [];
    const out: { label: string; value: string }[] = [];
    for (const [k, v] of Object.entries(ex as Record<string, unknown>)) {
      if (k === 'photo_data') continue;
      if (v === null || v === undefined) continue;
      const str = String(v).trim();
      if (!str) continue;
      const label = this.extraKeyLabels[k] ?? k.replace(/_/g, ' ');
      const display = str.length > 200 ? `${str.slice(0, 200)}…` : str;
      out.push({ label, value: display });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }

  /** Admission extras not already listed in the accordion summary block. */
  extraDisplayRowsRemaining(s: Student): { label: string; value: string }[] {
    const ex = s.admission_extras;
    if (!ex || typeof ex !== 'object') return [];
    const out: { label: string; value: string }[] = [];
    for (const [k, v] of Object.entries(ex as Record<string, unknown>)) {
      if (k === 'photo_data' || this.accordionSummaryExtraKeys.has(k)) continue;
      if (v === null || v === undefined) continue;
      const str = String(v).trim();
      if (!str) continue;
      const label = this.extraKeyLabels[k] ?? k.replace(/_/g, ' ');
      const display = str.length > 200 ? `${str.slice(0, 200)}…` : str;
      out.push({ label, value: display });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }

  saveEdit(): void {
    const d = this.draft();
    if (!d) return;
    if (!d.full_name.trim() || !d.class_name.trim() || !d.admission_no.trim()) {
      this.editError.set('Name, class, and admission number are required.');
      return;
    }
    this.editError.set('');
    this.savingEdit.set(true);
    const body: StudentPayload = {
      admission_no: d.admission_no.trim(),
      full_name: d.full_name.trim(),
      class_name: d.class_name.trim(),
      section: d.section.trim(),
      parent_phone: d.parent_phone.trim(),
      parent_name: d.parent_name.trim(),
      date_of_birth: d.date_of_birth.trim(),
      gender: d.gender.trim(),
      admission_extras: { ...d.admission_extras },
    };
    this.api.updateStudent(d.id, body).subscribe({
      next: (updated) => {
        this.savingEdit.set(false);
        this.students.update((list) => list.map((row) => (row.id === updated.id ? updated : row)));
        this.schoolRef.invalidateRosterCache();
        this.clearEdit();
      },
      error: () => {
        this.savingEdit.set(false);
        this.editError.set('Save failed (duplicate admission number?).');
      },
    });
  }
}
