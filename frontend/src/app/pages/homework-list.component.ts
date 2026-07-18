import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HomeworkDescriptionViewComponent } from '../homework/homework-description-view.component';
import { catchError, of } from 'rxjs';
import { ApiService, Faculty, Homework, SchoolClassRow } from '../core/api.service';
import {
  homeworkDueStatus,
  HomeworkDueStatus,
  isHomeworkDone,
  toggleHomeworkDone,
} from '../core/homework-completion.util';
import { SessionService } from '../core/session.service';
import { normalizeHomeworkDescription } from '../core/homework-description.util';

@Component({
  selector: 'app-homework-list',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, FormsModule, HomeworkDescriptionViewComponent],
  templateUrl: './homework-list.component.html',
  styleUrl: './homework-list.component.scss',
})
export class HomeworkListComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);

  homeworks: Homework[] = [];
  classes: SchoolClassRow[] = [];
  teachers: Faculty[] = [];
  loading = false;
  loadError = false;
  mutationError = '';
  /** True after user runs a successful filter request (not blocked by validation). */
  hasAttemptedLoad = false;

  readonly filters = {
    date: '',
    class: '',
    teacher: '',
  };
  filtersSubmitted = false;

  editingId: number | null = null;
  editAttachmentError = '';
  readonly allowedEditAttachmentExt = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
  /** Hidden from UI; preserved on save when row had values. */
  readonly editDraft: {
    date: string;
    academic_year: string;
    class: string;
    section: string;
    teacher: string;
    subject: string;
    description: string;
    due_date: string;
    marks: string;
    attachment_name: string;
  } = {
    date: '',
    academic_year: '',
    class: '',
    section: '',
    teacher: '',
    subject: '',
    description: '',
    due_date: '',
    marks: '',
    attachment_name: '',
  };

  editSubmitted = false;
  savingEdit = false;
  pendingDelete: Homework | null = null;
  deleting = false;
  studentProfileError = false;

  readonly todayIso = new Date().toISOString().slice(0, 10);

  get isStudentView(): boolean {
    return this.session.isLoggedInAs('student');
  }

  get isTeacherView(): boolean {
    return this.session.isLoggedInAs('teacher');
  }

  /** Profile not yet applied — avoid empty-state flash before first load. */
  get studentWaitingClass(): boolean {
    return this.isStudentView && !this.filters.class.trim() && !this.studentProfileError;
  }

  get showAddHomework(): boolean {
    return this.session.isLoggedInAs('admin') || this.session.isLoggedInAs('teacher');
  }

  addHomeworkLink(): string {
    return this.session.isLoggedInAs('teacher') ? '/teacher/homework/add' : '/homework/add';
  }

  ngOnInit(): void {
    this.filters.date = new Date().toISOString().split('T')[0];

    if (this.isStudentView) {
      const id = Number(this.session.userId() || 0);
      if (!id) {
        this.studentProfileError = true;
        return;
      }
      this.api
        .getStudent(id)
        .pipe(catchError(() => of(null)))
        .subscribe((st) => {
          const cn = (st?.class_name || '').trim();
          if (!cn) {
            this.studentProfileError = true;
            return;
          }
          this.filters.class = cn;
          this.loadHomework();
        });
      return;
    }

    this.api
      .listSchoolClasses()
      .pipe(catchError(() => of<SchoolClassRow[]>([])))
      .subscribe((rows) => {
        this.classes = [...rows].sort((a, b) => a.sort_order - b.sort_order);
      });

    if (this.isTeacherView) {
      this.filters.teacher = this.session.displayName().trim();
      const tid = Number(this.session.userId() || 0);
      if (tid) {
        this.api
          .getFaculty(tid)
          .pipe(catchError(() => of(null)))
          .subscribe((f) => {
            this.teachers = f ? [f] : [];
          });
      } else {
        this.teachers = [];
      }
      return;
    }

    this.api
      .listFaculty()
      .pipe(catchError(() => of<Faculty[]>([])))
      .subscribe((rows) => {
        this.teachers = [...rows].sort((a, b) => a.name.localeCompare(b.name));
      });
  }

  onStudentDateChange(): void {
    if (!this.isStudentView || !this.filters.class.trim() || !this.filters.date.trim()) return;
    this.loadHomework();
  }

  isFilterInvalid(): boolean {
    if (!this.filters.date.trim()) return true;
    return !this.filters.class.trim();
  }

  filterHasErr(name: 'date' | 'class'): boolean {
    if (!this.filtersSubmitted) return false;
    if (name === 'date') return !this.filters.date.trim();
    return !this.filters.class.trim();
  }

  loadHomework(): void {
    this.filtersSubmitted = true;
    if (this.isFilterInvalid()) {
      this.homeworks = [];
      return;
    }
    this.hasAttemptedLoad = true;
    this.loading = true;
    this.loadError = false;
    this.mutationError = '';
    this.api
      .getHomeworks({
        date: this.filters.date.trim(),
        class: this.filters.class.trim(),
        teacher: this.filters.teacher.trim() || undefined,
      })
      .pipe(
        catchError((err) => {
          this.loadError = true;
          console.error('Homework list API error:', err);
          return of<Homework[]>([]);
        }),
      )
      .subscribe((res) => {
        this.homeworks = res;
        this.loading = false;
      });
  }

  requestDelete(row: Homework): void {
    this.pendingDelete = row;
  }

  cancelDelete(): void {
    this.pendingDelete = null;
    this.deleting = false;
  }

  confirmDelete(): void {
    const row = this.pendingDelete;
    if (!row) return;
    this.deleting = true;
    this.api.deleteHomework(row.id).subscribe({
      next: () => {
        this.deleting = false;
        this.pendingDelete = null;
        this.loadHomework();
      },
      error: (err) => {
        this.deleting = false;
        console.error('Delete homework failed:', err);
        this.mutationError = 'Delete failed. Please try again.';
      },
    });
  }

  startEdit(row: Homework): void {
    this.editSubmitted = false;
    this.editAttachmentError = '';
    this.editingId = row.id;
    this.editDraft.date = row.date.slice(0, 10);
    this.editDraft.academic_year = row.academic_year || '';
    this.editDraft.class = row.class;
    this.editDraft.section = row.section || '';
    this.editDraft.teacher = row.teacher;
    this.editDraft.subject = row.subject;
    this.editDraft.description = row.description;
    this.editDraft.due_date = row.due_date ? row.due_date.slice(0, 10) : '';
    this.editDraft.marks = row.marks || '';
    this.editDraft.attachment_name = row.attachment_name || '';
  }

  cancelEdit(): void {
    this.editingId = null;
    this.savingEdit = false;
    this.editSubmitted = false;
    this.editAttachmentError = '';
  }

  onEditAttachmentChange(_evt: Event, input: HTMLInputElement): void {
    const file = input.files?.[0] ?? null;
    this.editAttachmentError = '';
    if (!file) return;
    const ext = file.name.includes('.')
      ? (file.name.split('.').pop() || '').toLowerCase()
      : '';
    if (!this.allowedEditAttachmentExt.includes(ext)) {
      this.editAttachmentError = 'Use PDF, Word (.doc, .docx), JPG, or PNG only.';
      input.value = '';
      return;
    }
    this.editDraft.attachment_name = file.name;
  }

  triggerEditAttachmentPicker(input: HTMLInputElement): void {
    input.click();
  }

  clearEditAttachment(input: HTMLInputElement): void {
    input.value = '';
    this.editDraft.attachment_name = '';
    this.editAttachmentError = '';
  }

  saveEdit(): void {
    if (this.editingId == null) return;
    this.editSubmitted = true;
    if (!this.editDraft.date.trim() || !this.editDraft.class.trim()) {
      this.mutationError = 'Date and class are required.';
      return;
    }
    this.savingEdit = true;
    this.api
      .updateHomework(this.editingId, {
        date: this.editDraft.date.trim(),
        class: this.editDraft.class.trim(),
        teacher: this.editDraft.teacher.trim(),
        subject: this.editDraft.subject.trim(),
        description: normalizeHomeworkDescription(this.editDraft.description),
        due_date: this.editDraft.due_date.trim() || null,
        marks: this.editDraft.marks.trim(),
        attachment_name: this.editDraft.attachment_name.trim(),
        academic_year: this.editDraft.academic_year.trim(),
        section: this.editDraft.section.trim(),
      })
      .subscribe({
        next: () => {
          this.savingEdit = false;
          this.editingId = null;
          this.editSubmitted = false;
          this.editAttachmentError = '';
          this.loadHomework();
        },
        error: (err) => {
          this.savingEdit = false;
          console.error('Update homework failed:', err);
          this.mutationError = 'Update failed. Please try again.';
        },
      });
  }

  editHasErr(name: 'date' | 'class'): boolean {
    if (!this.editSubmitted) return false;
    if (name === 'date') return !this.editDraft.date.trim();
    return !this.editDraft.class.trim();
  }

  isEditInvalid(): boolean {
    return !this.editDraft.date.trim() || !this.editDraft.class.trim();
  }

  hwDueStatus(h: Homework): HomeworkDueStatus {
    return homeworkDueStatus(h.id, h.date || '', this.todayIso);
  }

  hwStatusLabel(h: Homework): string {
    const s = this.hwDueStatus(h);
    if (s === 'completed') return 'Completed';
    if (s === 'overdue') return 'Overdue';
    return 'Pending';
  }

  hwStatusClass(h: Homework): string {
    const s = this.hwDueStatus(h);
    if (s === 'completed') return 'hw-student-done';
    if (s === 'overdue') return 'hw-student-overdue';
    return 'hw-student-pending';
  }

  toggleHwDone(id: number, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    toggleHomeworkDone(id);
  }

  hwDone(id: number): boolean {
    return isHomeworkDone(id);
  }

}
