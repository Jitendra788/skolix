import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ApiService, Student, StudentPayload } from '../core/api.service';
import { SchoolRefService } from '../core/school-ref.service';

@Component({
  selector: 'app-student-promote',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './student-promote.component.html',
  styleUrls: ['./pages-shared.scss', './student-promote.component.scss'],
})
export class StudentPromoteComponent {
  private readonly api = inject(ApiService);
  readonly schoolRef = inject(SchoolRefService);

  readonly sourceClass = signal('');
  readonly targetClass = signal('');
  readonly searchTerm = signal('');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly loadError = signal('');
  readonly saveMessage = signal<{ text: string; error: boolean } | null>(null);

  readonly students = signal<Student[]>([]);
  readonly selectedIds = signal<Set<number>>(new Set<number>());

  readonly filteredStudents = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const rows = this.students();
    if (!q) return rows;
    return rows.filter((s) => {
      const name = (s.full_name || '').toLowerCase();
      const adm = (s.admission_no || '').toLowerCase();
      return name.includes(q) || adm.includes(q);
    });
  });

  readonly allVisibleSelected = computed(() => {
    const rows = this.filteredStudents();
    if (rows.length === 0) return false;
    const set = this.selectedIds();
    return rows.every((s) => set.has(s.id));
  });

  readonly selectedCount = computed(() => this.selectedIds().size);

  constructor() {
    this.schoolRef.loadAll();
  }

  loadStudentsForClass(): void {
    const cls = this.sourceClass().trim();
    if (!cls) return;
    this.loading.set(true);
    this.loadError.set('');
    this.saveMessage.set(null);
    this.students.set([]);
    this.selectedIds.set(new Set<number>());
    this.api.listStudents({ className: cls }).subscribe({
      next: (rows) => {
        this.loading.set(false);
        const sorted = [...rows].sort((a, b) =>
          (a.full_name || '').localeCompare(b.full_name || ''),
        );
        this.students.set(sorted);
      },
      error: () => {
        this.loading.set(false);
        this.loadError.set('Could not load students for this class. Please retry.');
      },
    });
  }

  reload(): void {
    this.loadStudentsForClass();
  }

  toggleOne(studentId: number, checked: boolean): void {
    const next = new Set(this.selectedIds());
    if (checked) {
      next.add(studentId);
    } else {
      next.delete(studentId);
    }
    this.selectedIds.set(next);
  }

  toggleVisible(checked: boolean): void {
    const next = new Set(this.selectedIds());
    for (const s of this.filteredStudents()) {
      if (checked) next.add(s.id);
      else next.delete(s.id);
    }
    this.selectedIds.set(next);
  }

  selected(studentId: number): boolean {
    return this.selectedIds().has(studentId);
  }

  clearSelection(): void {
    this.selectedIds.set(new Set<number>());
  }

  private toPayload(s: Student, nextClassName: string): StudentPayload {
    return {
      admission_no: (s.admission_no || '').trim(),
      full_name: (s.full_name || '').trim(),
      class_name: nextClassName,
      section: (s.section || '').trim(),
      parent_phone: (s.parent_phone || '').trim(),
      parent_name: (s.parent_name || '').trim(),
      date_of_birth: (s.date_of_birth || '').trim(),
      gender: (s.gender || '').trim(),
      admission_extras:
        s.admission_extras && typeof s.admission_extras === 'object'
          ? { ...s.admission_extras }
          : {},
      login_enabled: s.login_enabled,
      login_username: (s.login_username || '').trim(),
      has_login_password: s.has_login_password,
    };
  }

  async savePromotions(): Promise<void> {
    if (this.saving()) return;
    const selected = this.students().filter((s) => this.selectedIds().has(s.id));
    const toClass = this.targetClass().trim();
    const fromClass = this.sourceClass().trim();
    if (!fromClass || !toClass || selected.length === 0) return;
    if (fromClass === toClass) {
      this.saveMessage.set({
        text: 'Target class must be different from source class.',
        error: true,
      });
      return;
    }
    const ok = confirm(
      `Promote ${selected.length} selected student(s) from ${fromClass} to ${toClass}?`,
    );
    if (!ok) return;

    this.saving.set(true);
    this.saveMessage.set(null);

    let success = 0;
    let failed = 0;
    for (const s of selected) {
      try {
        await firstValueFrom(this.api.updateStudent(s.id, this.toPayload(s, toClass)));
        success += 1;
      } catch {
        failed += 1;
      }
    }

    this.saving.set(false);
    if (failed === 0) {
      this.saveMessage.set({
        text: `Promoted ${success} student(s) to ${toClass}.`,
        error: false,
      });
      this.loadStudentsForClass();
      this.schoolRef.invalidateRosterCache();
      return;
    }

    this.saveMessage.set({
      text: `Promoted ${success} student(s), ${failed} failed. Please retry the failed records.`,
      error: true,
    });
    this.loadStudentsForClass();
    this.schoolRef.invalidateRosterCache();
  }
}
