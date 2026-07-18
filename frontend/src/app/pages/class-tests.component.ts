import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { CLASS_TEST_RECORDS_KEY } from '../core/class-test-local.util';
import { ApiService, ClassSubjectRow, SchoolClassRow, Student } from '../core/api.service';
import { SchoolRefService } from '../core/school-ref.service';

type TabId = 'manage' | 'result';

function toIsoLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface SavedMarkRow {
  student_id: number;
  admission_no: string;
  student_name: string;
  obtained_marks: number;
}

interface SavedTestRecord {
  id: string;
  class_name: string;
  subject: string;
  test_date: string;
  total_marks: number;
  rows: SavedMarkRow[];
  saved_at: string;
}

@Component({
  selector: 'app-class-tests',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './class-tests.component.html',
  styleUrl: './class-tests.component.scss',
})
export class ClassTestsComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly schoolRef = inject(SchoolRefService);
  private readonly router = inject(Router);
  private readonly storageKey = CLASS_TEST_RECORDS_KEY;
  private navSub = this.router.events.subscribe((e) => {
    if (e instanceof NavigationEnd) {
      this.syncTabFromUrl(e.urlAfterRedirects || this.router.url);
    }
  });

  readonly activeTab = signal<TabId>('manage');
  readonly classes = signal<SchoolClassRow[]>([]);
  readonly subjects = signal<ClassSubjectRow[]>([]);
  readonly loadingSubjects = signal(false);
  readonly saving = signal(false);

  readonly selectedClass = signal('');
  readonly selectedSubject = signal('');
  readonly testDate = signal('');
  readonly totalMarks = signal<number | null>(null);
  readonly obtainedByStudentId = signal<Record<number, string>>({});
  readonly saveMessage = signal('');

  readonly resultClass = signal('');
  readonly resultSubject = signal('');
  readonly records = signal<SavedTestRecord[]>(this.readRecords());

  readonly students = computed<Student[]>(() => {
    const cls = this.selectedClass().trim();
    if (!cls) return [];
    return this.schoolRef.rosterFor(cls);
  });

  readonly filteredResults = computed(() => {
    const cls = this.resultClass().trim();
    const sub = this.resultSubject().trim();
    return this.records().filter((r) => {
      if (cls && r.class_name !== cls) return false;
      if (sub && r.subject !== sub) return false;
      return true;
    });
  });

  constructor() {
    this.syncTabFromUrl(this.router.url);
    this.schoolRef.loadAll();
    this.api
      .listSchoolClasses()
      .pipe(catchError(() => of<SchoolClassRow[]>([])))
      .subscribe((rows) => {
        this.classes.set([...rows].sort((a, b) => a.sort_order - b.sort_order));
      });
  }

  switchTab(tab: TabId): void {
    this.activeTab.set(tab);
    this.router.navigateByUrl(tab === 'manage' ? '/class-tests/manage' : '/class-tests/results');
  }

  /** Test date allowed window: 2 months before today through 2 months after (local calendar). */
  testDateMinIso(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    return toIsoLocalDate(d);
  }

  testDateMaxIso(): string {
    const d = new Date();
    d.setMonth(d.getMonth() + 2);
    return toIsoLocalDate(d);
  }

  isTestDateAllowed(iso: string): boolean {
    const s = (iso || '').trim();
    if (!s) return false;
    const min = this.testDateMinIso();
    const max = this.testDateMaxIso();
    return s >= min && s <= max;
  }

  manageSaveDisabled(): boolean {
    const date = this.testDate().trim();
    return (
      this.saving() ||
      !this.selectedClass().trim() ||
      !this.selectedSubject().trim() ||
      !date ||
      !this.totalMarks() ||
      !this.isTestDateAllowed(date)
    );
  }

  onTestDateChange(raw: string): void {
    this.testDate.set(raw || '');
    if (!raw.trim()) {
      if (this.saveMessage().startsWith('Test date must')) {
        this.saveMessage.set('');
      }
      return;
    }
    if (!this.isTestDateAllowed(raw)) {
      this.saveMessage.set(
        `Test date must be between ${this.testDateMinIso()} and ${this.testDateMaxIso()} (within ±2 months of today).`,
      );
    } else if (this.saveMessage().startsWith('Test date must')) {
      this.saveMessage.set('');
    }
  }

  onTotalMarksChange(raw: unknown): void {
    const n = raw == null || raw === '' ? null : Number(raw);
    const nextTotal = Number.isFinite(n as number) && (n as number) > 0 ? (n as number) : null;
    this.totalMarks.set(nextTotal);
    if (nextTotal == null) return;
    this.obtainedByStudentId.update((m) => {
      const out: Record<number, string> = { ...m };
      for (const [k, v] of Object.entries(out)) {
        const id = Number(k);
        const val = Number(v);
        if (Number.isFinite(val) && val > nextTotal) {
          out[id] = String(nextTotal);
        }
      }
      return out;
    });
  }

  onManageClassChange(className: string): void {
    this.selectedClass.set(className);
    this.selectedSubject.set('');
    this.testDate.set('');
    this.subjects.set([]);
    this.totalMarks.set(null);
    this.obtainedByStudentId.set({});
    this.saveMessage.set('');

    const cls = className.trim();
    if (!cls) return;
    this.schoolRef.ensureStudentsForClass(cls);

    const row = this.classes().find((c) => c.name === cls);
    if (!row) return;
    this.loadingSubjects.set(true);
    this.api
      .listClassSubjects(row.id)
      .pipe(catchError(() => of<ClassSubjectRow[]>([])))
      .subscribe((rows) => {
        this.subjects.set(rows);
        this.loadingSubjects.set(false);
      });
  }

  onManageSubjectChange(subject: string): void {
    this.selectedSubject.set(subject);
    this.testDate.set('');
    this.totalMarks.set(null);
    this.obtainedByStudentId.set({});
    this.saveMessage.set('');
  }

  setObtained(studentId: number, raw: string | number | null): void {
    const value = this.clampObtainedRaw(raw);
    this.obtainedByStudentId.update((m) => ({ ...m, [studentId]: value }));
  }

  /** Re-sync DOM after number inputs that ignored one-way [value] updates. */
  clampObtainedOnBlur(studentId: number, el: HTMLInputElement): void {
    const total = this.totalMarks();
    const raw = el?.value ?? '';
    const next = this.clampObtainedRaw(raw);
    this.obtainedByStudentId.update((m) => ({ ...m, [studentId]: next }));
    if (total != null && total > 0 && raw !== '' && next !== String(raw)) {
      el.value = next;
    }
  }

  private clampObtainedRaw(raw: string | number | null): string {
    if (raw == null || raw === '') return '';
    const str = String(raw).trim();
    if (str === '') return '';
    const n = Number(str);
    if (!Number.isFinite(n)) return '';
    const total = this.totalMarks();
    if (total != null && total > 0) {
      if (n > total) return String(total);
      if (n < 0) return '0';
    }
    return str;
  }

  saveMarks(): void {
    const className = this.selectedClass().trim();
    const subject = this.selectedSubject().trim();
    const date = this.testDate().trim();
    const total = this.totalMarks();
    if (!className || !subject || !date || !total || total <= 0) {
      this.saveMessage.set('Class, subject, date and total test marks are required.');
      return;
    }
    if (!this.isTestDateAllowed(date)) {
      this.saveMessage.set(
        `Test date must be between ${this.testDateMinIso()} and ${this.testDateMaxIso()} (within ±2 months of today).`,
      );
      return;
    }
    const rows: SavedMarkRow[] = [];
    for (const s of this.students()) {
      const raw = (this.obtainedByStudentId()[s.id] || '').trim();
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) continue;
      if (n > total) {
        this.saveMessage.set(`Obtained marks cannot be greater than total test marks (${total}).`);
        return;
      }
      rows.push({
        student_id: s.id,
        admission_no: s.admission_no,
        student_name: s.full_name,
        obtained_marks: n,
      });
    }
    if (!rows.length) {
      this.saveMessage.set('Enter at least one student marks before saving.');
      return;
    }

    this.saving.set(true);
    const id = `${className}__${subject}__${date}`;
    const next: SavedTestRecord = {
      id,
      class_name: className,
      subject,
      test_date: date,
      total_marks: total,
      rows,
      saved_at: new Date().toISOString(),
    };
    const updated = this.records().filter((r) => r.id !== id);
    updated.unshift(next);
    this.records.set(updated);
    this.writeRecords(updated);
    this.saving.set(false);
    this.saveMessage.set('Test marks saved successfully.');
    this.resultClass.set(className);
    this.resultSubject.set(subject);
  }

  rowPercent(row: SavedMarkRow, total: number): number {
    if (!total) return 0;
    return Math.round((row.obtained_marks / total) * 100);
  }

  rowGrade(percent: number): string {
    if (percent >= 90) return 'A+';
    if (percent >= 80) return 'A';
    if (percent >= 70) return 'B';
    if (percent >= 60) return 'C';
    if (percent >= 50) return 'D';
    return 'F';
  }

  private readRecords(): SavedTestRecord[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as SavedTestRecord[];
    } catch {
      return [];
    }
  }

  private writeRecords(rows: SavedTestRecord[]): void {
    localStorage.setItem(this.storageKey, JSON.stringify(rows));
  }

  private syncTabFromUrl(url: string): void {
    if (url.includes('/class-tests/results')) {
      this.activeTab.set('result');
      return;
    }
    this.activeTab.set('manage');
  }

  ngOnDestroy(): void {
    this.navSub.unsubscribe();
  }
}
