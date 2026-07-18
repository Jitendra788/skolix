import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, EMPTY, finalize, map, of, switchMap, take } from 'rxjs';
import { ApiService, Student, StudentPayload } from '../core/api.service';
import { SECTION_LETTERS } from '../core/section-options';
import { SchoolRefService } from '../core/school-ref.service';

const PHOTO_MAX_BYTES = 350_000;

export interface AdmissionConfirmationSnapshot {
  studentId: number;
  fullName: string;
  admissionNo: string;
  className: string;
  section: string;
  admissionDateDisplay: string;
  photoDataUrl: string | null;
  portalUsername: string;
  portalPassword: string;
}

@Component({
  selector: 'app-student-admission',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './student-admission.component.html',
  styleUrls: ['./pages-shared.scss', './student-admission.component.scss'],
})
export class StudentAdmissionComponent {
  private readonly api = inject(ApiService);
  readonly schoolRef = inject(SchoolRefService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly sectionLetters = [...SECTION_LETTERS];

  readonly wizardSteps: readonly { id: number; title: string; short: string }[] = [
    { id: 1, title: 'Student information', short: 'Student' },
    { id: 2, title: 'Other information', short: 'Other' },
    { id: 3, title: 'Father / guardian', short: 'Father' },
    { id: 4, title: 'Mother', short: 'Mother' },
    { id: 5, title: 'Review', short: 'Review' },
  ];

  readonly religionOptions = [
    '',
    'Islam',
    'Christianity',
    'Hinduism',
    'Sikhism',
    'Buddhism',
    'Judaism',
    'Other',
  ];
  readonly bloodOptions = ['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  step = 1;
  lastAdmissionNo = '';
  saving = false;
  error = '';
  photoError = '';
  successMsg = '';
  photoFileLabel = '';
  /** Shown after a new student is created (not when editing). */
  admissionConfirmation: AdmissionConfirmationSnapshot | null = null;
  instituteName = '';

  /** When set, submit updates this student instead of creating. */
  editStudentId: number | null = null;
  loadingStudent = false;
  loadStudentError = '';
  /** Extras from server minus `photo_data`; merged on save so unknown keys are kept. */
  private retainedExtrasNoPhoto: Record<string, string> = {};

  fullName = '';
  admissionNo = '';
  dateOfAdmission = '';
  className = '';
  section = '';
  discountPct = '';
  smsPhone = '';

  photoData = '';
  photoPreview = '';

  dateOfBirth = '';
  birthFormNic = '';
  orphan = '';
  gender = '';
  caste = '';
  osc = '';
  identificationMark = '';
  previousSchool = '';
  religion = '';
  bloodGroup = '';
  previousBoardRoll = '';
  family = '';
  disease = '';
  additionalNote = '';
  totalSiblings = '';
  address = '';

  fatherName = '';
  fatherNationalId = '';
  fatherOccupation = '';
  fatherEducation = '';
  fatherMobile = '';
  fatherProfession = '';
  fatherIncome = '';

  motherName = '';
  motherNationalId = '';
  motherOccupation = '';
  motherEducation = '';
  motherMobile = '';
  motherProfession = '';
  motherIncome = '';

  @ViewChild('photoInput') photoInput?: ElementRef<HTMLInputElement>;

  constructor() {
    this.api
      .getInstituteProfile()
      .pipe(take(1), catchError(() => of(null)))
      .subscribe((p) => {
        const n = p?.name?.trim();
        if (n) this.instituteName = n;
      });
    this.refreshLastAdmission();
    this.route.queryParamMap
      .pipe(
        map((qm) => {
          const raw = qm.get('edit');
          const id =
            raw != null && raw !== '' ? Number.parseInt(raw, 10) : Number.NaN;
          return Number.isFinite(id) && id > 0 ? id : null;
        }),
        switchMap((id) => {
          if (id == null) {
            this.loadStudentError = '';
            this.applyExitEditWithoutFetch();
            return EMPTY;
          }
          this.loadingStudent = true;
          this.loadStudentError = '';
          return this.api.getStudent(id).pipe(
            map((s) => {
              this.applyStudentToForm(s, id);
              return s;
            }),
            catchError(() => {
              this.loadStudentError =
                'Could not load that student. Check the link or return to the list.';
              this.applyExitEditWithoutFetch();
              return EMPTY;
            }),
            finalize(() => {
              this.loadingStudent = false;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  /** Leaving `?edit=` — reset only if we had a loaded edit session. */
  private applyExitEditWithoutFetch(): void {
    if (this.editStudentId == null) return;
    this.editStudentId = null;
    this.retainedExtrasNoPhoto = {};
    this.admissionConfirmation = null;
    this.resetAllFields();
  }

  private formatAdmissionDateDisplay(isoYmd: string): string {
    const t = isoYmd.trim();
    if (!t) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if (!m) return t;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return t;
    const dt = new Date(y, mo - 1, d);
    const s = dt.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    return s.replace(/^(\d{2}) (\w+) (\d{4})$/, '$1 $2, $3');
  }

  private generatePortalCredentials(admissionNo: string): { user: string; pass: string } {
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    const tail = admissionNo.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'STU';
    const code = `${hex}${tail}`.slice(0, 20);
    return { user: code, pass: code };
  }

  private buildAdmissionConfirmationSnapshot(
    student: Student,
  ): AdmissionConfirmationSnapshot {
    const ex = (student.admission_extras || {}) as Record<string, unknown>;
    const dateRaw = this.normalizeDateInput(
      this.extraStrFromUnknown(ex['date_of_admission']),
    );
    const pd = ex['photo_data'];
    const photoDataUrl =
      typeof pd === 'string' && pd.startsWith('data:') ? pd : null;
    const cred = this.generatePortalCredentials(student.admission_no || '');
    return {
      studentId: student.id,
      fullName: (student.full_name || '').trim(),
      admissionNo: (student.admission_no || '').trim(),
      className: (student.class_name || '').trim(),
      section: (student.section || '').trim(),
      admissionDateDisplay: this.formatAdmissionDateDisplay(dateRaw),
      photoDataUrl,
      portalUsername: cred.user,
      portalPassword: cred.pass,
    };
  }

  clearAdmissionConfirmation(): void {
    this.admissionConfirmation = null;
  }

  printAdmissionLetter(): void {
    const c = this.admissionConfirmation;
    if (!c) return;
    const school = this.instituteName || 'School';
    const classLine =
      [c.className, c.section].filter(Boolean).join(c.section ? ' — ' : '') || '—';
    const esc = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const body = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Admission letter — ${esc(c.fullName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #0f172a; margin: 2rem; line-height: 1.5; }
    h1 { font-size: 1.25rem; margin: 0 0 1rem; color: #1e293b; }
    .meta { margin: 0 0 1.5rem; font-size: 0.95rem; }
    .meta dt { font-weight: 700; color: #475569; margin: 0.35rem 0 0.1rem; }
    .meta dd { margin: 0 0 0.35rem; }
    p { margin: 0 0 0.85rem; max-width: 40rem; }
    .sign { margin-top: 2.5rem; }
    @media print { body { margin: 1.2cm; } }
  </style>
</head>
<body>
  <h1>${esc(school)}</h1>
  <p><strong>Admission letter</strong></p>
  <p>Date: ${esc(new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }))}</p>
  <p>Dear Parent / Guardian,</p>
  <p>
    This is to confirm that <strong>${esc(c.fullName)}</strong> has been admitted to
    <strong>${esc(classLine)}</strong> with registration number <strong>${esc(c.admissionNo)}</strong>,
    with effect from <strong>${esc(c.admissionDateDisplay)}</strong>.
  </p>
  <p>
    Please retain the portal access details provided on your admission confirmation for future use.
    Initial username and password are intended for first-time sign-in; change the password after login if the portal is available.
  </p>
  <dl class="meta">
    <dt>Registration / ID</dt><dd>${esc(c.admissionNo)}</dd>
    <dt>Portal username</dt><dd>${esc(c.portalUsername)}</dd>
    <dt>Portal password</dt><dd>${esc(c.portalPassword)}</dd>
  </dl>
  <p class="sign">Yours faithfully,<br /><br />Authorised signatory<br />${esc(school)}</p>
</body>
</html>`;

    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) {
      return;
    }
    w.document.write(body);
    w.document.close();
    w.focus();
    w.print();
  }

  private extraStrFromUnknown(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
  }

  private normalizeDateInput(raw: string): string {
    const t = raw.trim();
    if (!t) return '';
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(t);
    return m ? m[1]! : t;
  }

  private splitParentCombined(name: string): { father: string; mother: string } {
    const t = name.trim();
    if (!t) return { father: '', mother: '' };
    const parts = t.split(' & ').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        father: parts[0] ?? '',
        mother: parts.slice(1).join(' & '),
      };
    }
    return { father: t, mother: '' };
  }

  private absorbRetainedExtras(ex: Record<string, unknown>): void {
    this.retainedExtrasNoPhoto = {};
    for (const [k, v] of Object.entries(ex)) {
      if (k === 'photo_data') continue;
      const s = this.extraStrFromUnknown(v).trim();
      if (s !== '') this.retainedExtrasNoPhoto[k] = s;
    }
  }

  private applyStudentToForm(s: Student, id: number): void {
    this.error = '';
    this.successMsg = '';
    this.admissionConfirmation = null;
    this.step = 1;
    const ex = (s.admission_extras || {}) as Record<string, unknown>;
    this.absorbRetainedExtras(ex);

    const pd = ex['photo_data'];
    if (typeof pd === 'string' && pd.startsWith('data:')) {
      this.photoData = pd;
      this.photoPreview = pd;
      this.photoFileLabel = 'Current photo';
    } else {
      this.clearPhoto();
    }

    this.fullName = (s.full_name || '').trim();
    this.admissionNo = (s.admission_no || '').trim();
    this.className = (s.class_name || '').trim();
    this.section = (s.section || '').trim();
    this.dateOfBirth = this.normalizeDateInput((s.date_of_birth || '').trim());
    this.gender = (s.gender || '').trim();
    this.smsPhone = (s.parent_phone || '').trim();

    this.dateOfAdmission = this.normalizeDateInput(
      this.extraStrFromUnknown(ex['date_of_admission']),
    );
    this.discountPct = this.extraStrFromUnknown(ex['discount_fee_percent']);
    this.birthFormNic = this.extraStrFromUnknown(ex['birth_form_nic']);
    this.orphan = this.extraStrFromUnknown(ex['orphan']);
    this.caste = this.extraStrFromUnknown(ex['caste']);
    this.osc = this.extraStrFromUnknown(ex['osc']);
    this.identificationMark = this.extraStrFromUnknown(ex['identification_mark']);
    this.previousSchool = this.extraStrFromUnknown(ex['previous_school']);
    this.religion = this.extraStrFromUnknown(ex['religion']);
    this.bloodGroup = this.extraStrFromUnknown(ex['blood_group']);
    this.previousBoardRoll = this.extraStrFromUnknown(ex['previous_board_roll']);
    this.family = this.extraStrFromUnknown(ex['family']);
    this.disease = this.extraStrFromUnknown(ex['disease']);
    this.additionalNote = this.extraStrFromUnknown(ex['additional_note']);
    this.totalSiblings = this.extraStrFromUnknown(ex['total_siblings']);
    this.address = this.extraStrFromUnknown(ex['address']);

    const split = this.splitParentCombined(s.parent_name || '');
    this.fatherName =
      this.extraStrFromUnknown(ex['father_name']).trim() || split.father;
    this.motherName =
      this.extraStrFromUnknown(ex['mother_name']).trim() || split.mother;
    this.fatherNationalId = this.extraStrFromUnknown(ex['father_national_id']);
    this.fatherOccupation = this.extraStrFromUnknown(ex['father_occupation']);
    this.fatherEducation = this.extraStrFromUnknown(ex['father_education']);
    this.fatherMobile = this.extraStrFromUnknown(ex['father_mobile']);
    this.fatherProfession = this.extraStrFromUnknown(ex['father_profession']);
    this.fatherIncome = this.extraStrFromUnknown(ex['father_income']);
    this.motherNationalId = this.extraStrFromUnknown(ex['mother_national_id']);
    this.motherOccupation = this.extraStrFromUnknown(ex['mother_occupation']);
    this.motherEducation = this.extraStrFromUnknown(ex['mother_education']);
    this.motherMobile = this.extraStrFromUnknown(ex['mother_mobile']);
    this.motherProfession = this.extraStrFromUnknown(ex['mother_profession']);
    this.motherIncome = this.extraStrFromUnknown(ex['mother_income']);

    this.editStudentId = id;
  }

  refreshLastAdmission(): void {
    this.api.getLastAdmissionNumber().subscribe({
      next: (r) => {
        this.lastAdmissionNo = (r.last_admission_no || '').trim();
      },
      error: () => {
        this.lastAdmissionNo = '';
      },
    });
  }

  isStepClickable(targetStep: number): boolean {
    return targetStep < this.step;
  }

  onStepPillClick(id: number): void {
    if (this.isStepClickable(id)) {
      this.goToStep(id);
    }
  }

  goToStep(target: number): void {
    if (target < 1 || target > 5 || target >= this.step) return;
    this.error = '';
    this.step = target;
  }

  nextStep(): void {
    const msg = this.validateStep(this.step);
    if (msg) {
      this.error = msg;
      return;
    }
    this.error = '';
    if (this.step < 5) {
      this.step += 1;
    }
  }

  prevStep(): void {
    this.error = '';
    if (this.step > 1) {
      this.step -= 1;
    }
  }

  /** Validates the current step before moving forward (step 5 validated on submit). */
  validateStep(s: number): string | null {
    if (s === 1) {
      if (!this.fullName.trim()) return 'Student name is required.';
      if (!this.admissionNo.trim()) return 'Registration / admission number is required.';
      if (!this.dateOfAdmission.trim()) return 'Date of admission is required.';
      if (!this.className.trim()) return 'Class is required.';
    }
    return null;
  }

  onPhotoChange(ev: Event): void {
    this.photoError = '';
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      this.clearPhoto();
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      this.photoError = `Choose an image under ${Math.round(PHOTO_MAX_BYTES / 1000)} KB.`;
      input.value = '';
      this.clearPhoto();
      return;
    }
    this.photoFileLabel = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (dataUrl.length > 500_000) {
        this.photoError = 'That image is still too large after encoding.';
        this.clearPhoto();
        input.value = '';
        return;
      }
      this.photoData = dataUrl;
      this.photoPreview = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  clearPhoto(): void {
    this.photoData = '';
    this.photoPreview = '';
    this.photoFileLabel = '';
    const el = this.photoInput?.nativeElement;
    if (el) el.value = '';
  }

  cancelToDashboard(): void {
    if (this.editStudentId != null) {
      void this.router.navigateByUrl('/students/all');
      return;
    }
    void this.router.navigateByUrl('/dashboard');
  }

  onFormSubmit(ev: Event): void {
    ev.preventDefault();
    if (this.step === 5) {
      this.submit();
    }
  }

  private buildExtras(): Record<string, string> {
    const e: Record<string, string> = { ...this.retainedExtrasNoPhoto };
    const overlay: Record<string, string> = {
      date_of_admission: this.dateOfAdmission.trim(),
      discount_fee_percent: this.discountPct.trim(),
      birth_form_nic: this.birthFormNic.trim(),
      orphan: this.orphan.trim(),
      caste: this.caste.trim(),
      osc: this.osc.trim(),
      identification_mark: this.identificationMark.trim(),
      previous_school: this.previousSchool.trim(),
      religion: this.religion.trim(),
      blood_group: this.bloodGroup.trim(),
      previous_board_roll: this.previousBoardRoll.trim(),
      family: this.family.trim(),
      disease: this.disease.trim(),
      additional_note: this.additionalNote.trim(),
      total_siblings: this.totalSiblings.trim(),
      address: this.address.trim(),
      father_name: this.fatherName.trim(),
      father_national_id: this.fatherNationalId.trim(),
      father_occupation: this.fatherOccupation.trim(),
      father_education: this.fatherEducation.trim(),
      father_mobile: this.fatherMobile.trim(),
      father_profession: this.fatherProfession.trim(),
      father_income: this.fatherIncome.trim(),
      mother_name: this.motherName.trim(),
      mother_national_id: this.motherNationalId.trim(),
      mother_occupation: this.motherOccupation.trim(),
      mother_education: this.motherEducation.trim(),
      mother_mobile: this.motherMobile.trim(),
      mother_profession: this.motherProfession.trim(),
      mother_income: this.motherIncome.trim(),
    };
    for (const [k, v] of Object.entries(overlay)) {
      const t = v.trim();
      if (t === '') delete e[k];
      else e[k] = t;
    }
    if (this.photoData) e['photo_data'] = this.photoData;
    else delete e['photo_data'];
    return e;
  }

  private resetAllFields(): void {
    this.step = 1;
    this.fullName = '';
    this.admissionNo = '';
    this.dateOfAdmission = '';
    this.className = '';
    this.section = '';
    this.discountPct = '';
    this.smsPhone = '';
    this.clearPhoto();
    this.dateOfBirth = '';
    this.birthFormNic = '';
    this.orphan = '';
    this.gender = '';
    this.caste = '';
    this.osc = '';
    this.identificationMark = '';
    this.previousSchool = '';
    this.religion = '';
    this.bloodGroup = '';
    this.previousBoardRoll = '';
    this.family = '';
    this.disease = '';
    this.additionalNote = '';
    this.totalSiblings = '';
    this.address = '';
    this.fatherName = '';
    this.fatherNationalId = '';
    this.fatherOccupation = '';
    this.fatherEducation = '';
    this.fatherMobile = '';
    this.fatherProfession = '';
    this.fatherIncome = '';
    this.motherName = '';
    this.motherNationalId = '';
    this.motherOccupation = '';
    this.motherEducation = '';
    this.motherMobile = '';
    this.motherProfession = '';
    this.motherIncome = '';
    this.error = '';
    this.editStudentId = null;
    this.retainedExtrasNoPhoto = {};
  }

  submit(): void {
    this.error = '';
    const msg = this.validateStep(1);
    if (msg) {
      this.error = msg;
      this.step = 1;
      return;
    }

    const sms = this.smsPhone.trim();
    const parentPhone =
      sms || this.fatherMobile.trim() || this.motherMobile.trim();

    const parts = [this.fatherName.trim(), this.motherName.trim()].filter(Boolean);
    const parentName = parts.length ? parts.join(' & ') : '';

    const body: StudentPayload = {
      admission_no: this.admissionNo.trim(),
      full_name: this.fullName.trim(),
      class_name: this.className.trim(),
      section: this.section.trim(),
      parent_phone: parentPhone,
      parent_name: parentName,
      date_of_birth: this.dateOfBirth.trim(),
      gender: this.gender.trim(),
      admission_extras: this.buildExtras(),
    };

    this.saving = true;
    const editing = this.editStudentId;
    const req =
      editing != null
        ? this.api.updateStudent(editing, body)
        : this.api.createStudent(body);
    req.subscribe({
      next: (saved) => {
        this.saving = false;
        this.schoolRef.invalidateRosterCache();
        if (editing != null) {
          void this.router.navigateByUrl('/students/all');
          return;
        }
        this.successMsg = '';
        this.admissionConfirmation = this.buildAdmissionConfirmationSnapshot(saved);
        this.resetAllFields();
        this.refreshLastAdmission();
      },
      error: () => {
        this.saving = false;
        this.error =
          editing != null
            ? 'Could not save changes. Check the registration number is not used by another student.'
            : 'Could not save. Check that the registration number is unique.';
      },
    });
  }

  /** Display helper for review step */
  dash(v: string): string {
    const t = v?.trim();
    return t ? t : '—';
  }

  confirmationInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return (parts[0]![0] || '?').toUpperCase();
    const a = parts[0]![0] || '';
    const b = parts[parts.length - 1]![0] || '';
    return `${a}${b}`.toUpperCase();
  }

  confirmationClassLine(c: AdmissionConfirmationSnapshot): string {
    const cn = c.className.trim();
    const sec = c.section.trim();
    if (!cn) return '—';
    return sec ? `${cn} / ${sec}` : cn;
  }
}
