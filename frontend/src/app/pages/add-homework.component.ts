import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { QuillEditorComponent } from 'ngx-quill';
import { catchError, of } from 'rxjs';
import {
  ApiService,
  ClassSubjectRow,
  Faculty,
  HomeworkPayload,
  SchoolClassRow,
  Student,
} from '../core/api.service';
import { SessionService } from '../core/session.service';
import { ToastService } from '../core/toast.service';
import { HomeworkAttachmentDropzoneComponent } from '../homework/homework-attachment-dropzone.component';
import { HomeworkSectionCardComponent } from '../homework/homework-section-card.component';
import {
  HomeworkAssignMode,
  serializeStructuredContent,
} from '../homework/homework-structured.model';
import { normalizeHomeworkDescription } from '../core/homework-description.util';

/** Faculty.subject often lists one or more subjects separated by comma, semicolon, or slash. */
function parseTeacherProfileSubjects(raw: string | null | undefined): string[] {
  const s = (raw ?? '').trim();
  if (!s || s === '—' || s === '-' || s.toLowerCase() === 'n/a') return [];
  const parts = s
    .split(/[,;]\s*|\s*\/\s*|\s*\|\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}

function richInstructionsValidator(control: AbstractControl): ValidationErrors | null {
  return normalizeHomeworkDescription(control.value) ? null : { required: true };
}

@Component({
  selector: 'app-add-homework',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    QuillEditorComponent,
    HomeworkSectionCardComponent,
    HomeworkAttachmentDropzoneComponent,
  ],
  templateUrl: './add-homework.component.html',
  styleUrl: './add-homework.component.scss',
})
export class AddHomeworkComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);

  readonly form = this.fb.group({
    homeworkDate: [this.todayIso(), Validators.required],
    classId: ['', Validators.required],
    teacherId: [''],
    subject: [''],
    dueDate: [''],
    marks: [''],
    assignMode: this.fb.nonNullable.control<HomeworkAssignMode>('whole_class'),
    assignSection: [''],
    extraAdmissionNos: [''],
    hwTitle: ['', Validators.required],
    instructions: ['', richInstructionsValidator],
    submissionNotes: [''],
    attachment: this.fb.control<File | null>(null),
    questions: this.fb.array([this.fb.control('', { nonNullable: true })]),
  });

  get questions(): FormArray {
    return this.form.controls.questions;
  }

  classes: SchoolClassRow[] = [];
  teachers: Faculty[] = [];
  subjects: ClassSubjectRow[] = [];
  /** Subjects from logged-in teacher profile (names only). Used to filter class subject list. */
  teacherProfileSubjects: string[] = [];
  /** Latest API rows for selected class; re-filtered when teacher profile loads. */
  private lastLoadedClassSubjects: ClassSubjectRow[] = [];
  classRoster: Student[] = [];
  rosterLoading = false;

  /** Checkbox selection for “selected students” mode (admission numbers). */
  readonly admissionSelection = new Set<string>();

  submitted = false;
  subjectLoading = false;
  saving = false;

  readonly allowedAttachmentExt = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];

  get isTeacherView(): boolean {
    return this.session.isLoggedInAs('teacher');
  }

  ngOnInit(): void {
    if (this.isTeacherView) {
      this.form.controls.teacherId.setValidators([]);
    } else {
      this.form.controls.teacherId.setValidators([Validators.required]);
    }
    this.form.controls.teacherId.updateValueAndValidity();

    this.api
      .listSchoolClasses()
      .pipe(catchError(() => of<SchoolClassRow[]>([])))
      .subscribe((rows) => {
        this.classes = [...rows].sort((a, b) => a.sort_order - b.sort_order);
        this.restoreDraft();
      });

    const tid = Number(this.session.userId() || 0);
    if (this.isTeacherView && tid) {
      this.api
        .getFaculty(tid)
        .pipe(catchError(() => of(null)))
        .subscribe((f) => {
          this.teachers = f ? [f] : [];
          this.teacherProfileSubjects = f ? parseTeacherProfileSubjects(f.subject) : [];
          this.form.patchValue({ teacherId: String(tid) });
          this.applyTeacherSubjectFilter();
        });
    } else {
      this.api
        .listFaculty()
        .pipe(catchError(() => of<Faculty[]>([])))
        .subscribe((rows) => {
          this.teachers = [...rows].sort((a, b) => a.name.localeCompare(b.name));
        });
    }
  }

  private draftKey(): string {
    const uid = this.session.userId() || 'anon';
    const portal = this.isTeacherView ? 't' : 'a';
    return `skolix-hw-draft-${portal}-${uid}`;
  }

  private todayIso(): string {
    return new Date().toISOString().split('T')[0];
  }

  private restoreDraft(): void {
    const raw = localStorage.getItem(this.draftKey());
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as {
        form?: Record<string, unknown>;
        questions?: string[];
        admissions?: string[];
      };
      if (d.form && typeof d.form === 'object') {
        const { questions: _pq, ...formOnly } = d.form as Record<string, unknown>;
        this.form.patchValue(formOnly as never);
      }
      if (Array.isArray(d.questions) && d.questions.length) {
        this.questions.clear();
        d.questions.forEach((q) =>
          this.questions.push(this.fb.control(String(q), { nonNullable: true })),
        );
      } else {
        this.questions.clear();
        this.questions.push(this.fb.control('', { nonNullable: true }));
      }
      this.admissionSelection.clear();
      if (Array.isArray(d.admissions)) {
        d.admissions.forEach((a) => {
          const k = String(a).trim();
          if (k) this.admissionSelection.add(k);
        });
      }
      if (this.form.controls.classId.value) this.onClassChange();
    } catch {
      /* ignore corrupt draft */
    }
  }

  onClassChange(): void {
    const classIdRaw = this.form.controls.classId.value ?? '';
    this.form.controls.subject.setValue('');
    this.subjects = [];
    const classId = Number(classIdRaw);
    if (!classId) {
      this.classRoster = [];
      this.lastLoadedClassSubjects = [];
      return;
    }
    this.subjectLoading = true;
    this.api
      .listClassSubjects(classId)
      .pipe(catchError(() => of<ClassSubjectRow[]>([])))
      .subscribe((rows) => {
        this.lastLoadedClassSubjects = rows;
        this.applyTeacherSubjectFilter();
        this.subjectLoading = false;
      });

    const selectedClass = this.classes.find((c) => c.id === classId);
    if (!selectedClass) {
      this.classRoster = [];
      return;
    }
    this.rosterLoading = true;
    this.api
      .listStudents({ className: selectedClass.name })
      .pipe(catchError(() => of<Student[]>([])))
      .subscribe((rows) => {
        this.classRoster = [...rows].sort((a, b) =>
          (a.full_name || '').localeCompare(b.full_name || ''),
        );
        this.rosterLoading = false;
      });
  }

  private applyTeacherSubjectFilter(): void {
    const rows = this.lastLoadedClassSubjects;
    this.subjects = this.filterSubjectsForTeacher(rows);
    if (this.isTeacherView && this.subjects.length === 1) {
      this.form.patchValue({ subject: this.subjects[0].subject_name });
    }
  }

  /**
   * Teachers only see subjects that match their faculty profile (intersection with class
   * curriculum, or profile-only options if the class list has no match).
   */
  private filterSubjectsForTeacher(rows: ClassSubjectRow[]): ClassSubjectRow[] {
    if (!this.isTeacherView || !this.teacherProfileSubjects.length) {
      return rows;
    }
    const tokens = this.teacherProfileSubjects.map((t) => t.toLowerCase());
    const matched = rows.filter((r) =>
      tokens.includes((r.subject_name || '').trim().toLowerCase()),
    );
    if (matched.length) {
      return [...matched].sort((a, b) => a.sort_order - b.sort_order);
    }
    return this.teacherProfileSubjects.map((subject_name, i) => ({
      id: -(i + 1),
      subject_name,
      total_marks: '',
      sort_order: i,
    }));
  }

  onFileFromDropzone(file: File | null): void {
    this.form.controls.attachment.setValue(file);
  }

  addQuestion(): void {
    this.questions.push(this.fb.control('', { nonNullable: true }));
  }

  removeQuestion(i: number): void {
    if (this.questions.length <= 1) {
      this.questions.at(0).setValue('');
      return;
    }
    this.questions.removeAt(i);
  }

  admissionChecked(admissionNo: string): boolean {
    return this.admissionSelection.has((admissionNo || '').trim());
  }

  onAdmissionToggle(admissionNo: string, ev: Event): void {
    const checked = (ev.target as HTMLInputElement).checked;
    const k = (admissionNo || '').trim();
    if (!k) return;
    if (checked) this.admissionSelection.add(k);
    else this.admissionSelection.delete(k);
  }

  mergedStudentAdmissionNos(): string {
    const extra = (this.form.controls.extraAdmissionNos.value || '')
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const fromBoxes = [...this.admissionSelection];
    return [...new Set([...fromBoxes, ...extra])].join(', ');
  }

  canAssign(): boolean {
    if (this.form.invalid) return false;
    const mode = this.form.controls.assignMode.value;
    if (mode === 'section' && !this.form.controls.assignSection.value?.trim()) return false;
    if (mode === 'students' && !this.mergedStudentAdmissionNos()) return false;
    return true;
  }

  saveDraft(): void {
    const raw = this.form.getRawValue() as Record<string, unknown> & { questions: string[] };
    const { questions: qArr, ...formFields } = raw;
    const payload = {
      form: formFields,
      questions: qArr,
      admissions: [...this.admissionSelection],
    };
    localStorage.setItem(this.draftKey(), JSON.stringify(payload));
    this.toast.show('Draft saved on this device.');
  }

  homeworkListPath(): string {
    return this.isTeacherView ? '/teacher/homework' : '/homework';
  }

  portalHomePath(): string {
    return this.isTeacherView ? '/teacher' : '/dashboard';
  }

  onCancel(): void {
    void this.router.navigateByUrl(this.homeworkListPath());
  }

  assignHomework(): void {
    this.submitted = true;
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.canAssign()) return;

    const classId = Number(this.form.controls.classId.value);
    const teacherId = Number(this.form.controls.teacherId.value || 0);
    const selectedClass = this.classes.find((c) => c.id === classId);
    const selectedTeacher = this.teachers.find((t) => t.id === teacherId);
    if (!selectedClass) return;

    const mode = this.form.controls.assignMode.value;
    const section =
      mode === 'section' ? (this.form.controls.assignSection.value || '').trim() : '';

    const description = serializeStructuredContent({
      title: (this.form.controls.hwTitle.value ?? '').trim(),
      instructions: normalizeHomeworkDescription(this.form.controls.instructions.value) || '',
      questions: this.questions
        .getRawValue()
        .map((s) => s.trim())
        .filter(Boolean),
      submissionNotes: (this.form.controls.submissionNotes.value || '').trim(),
      assignMode: mode,
      assignSection: mode === 'section' ? (this.form.controls.assignSection.value || '').trim() : '',
      studentAdmissionNos: mode === 'students' ? this.mergedStudentAdmissionNos() : '',
    });

    const due = (this.form.controls.dueDate.value || '').trim();
    const body: HomeworkPayload = {
      date: this.form.controls.homeworkDate.value ?? '',
      class: selectedClass.name,
      teacher: selectedTeacher?.name || '',
      subject: (this.form.controls.subject.value || '').trim(),
      description,
      due_date: due || null,
      marks: (this.form.controls.marks.value || '').trim(),
      attachment_name: this.form.controls.attachment.value?.name || '',
      section,
    };

    this.saving = true;
    this.api.addHomework(body).subscribe({
      next: () => {
        this.saving = false;
        localStorage.removeItem(this.draftKey());
        this.toast.show('Homework assigned successfully.');
        setTimeout(() => void this.router.navigateByUrl(this.homeworkListPath()), 600);
      },
      error: (err) => {
        this.saving = false;
        console.error('Add homework failed:', err);
        this.toast.show('Could not save homework. Please try again.');
      },
    });
  }

  hasErr(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return !!c && c.invalid && (c.dirty || c.touched || this.submitted);
  }
}
