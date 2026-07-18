import {
  Component,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { ApiService, Student } from '../core/api.service';

@Component({
  selector: 'app-student-portal-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './student-portal-login.component.html',
  styleUrls: ['./pages-shared.scss', './student-portal-login.component.scss'],
})
export class StudentPortalLoginComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);

  students: Student[] = [];
  search = '';
  loading = false;
  loadError = '';
  totalCount = 0;
  readonly pageSize = 25;
  pageIndex = 0;
  applyingDefaults = false;
  applyDefaultsMessage = '';
  applyDefaultsError = false;

  /** Row or modal portal on/off (one request at a time). */
  portalToggleBusyId: number | null = null;
  portalAccessBanner: { text: string; error: boolean } | null = null;

  dialogOpen = false;
  editStudent: Student | null = null;
  formUsername = '';
  formPassword = '';
  formPassword2 = '';
  showPwd1 = false;
  showPwd2 = false;
  saveError = '';
  saving = false;

  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadPage();
  }

  ngOnDestroy(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.totalCount / this.pageSize));
  }

  get pageLabel(): string {
    if (this.totalCount === 0) return '0 students';
    const from = this.pageIndex * this.pageSize + 1;
    const to = Math.min((this.pageIndex + 1) * this.pageSize, this.totalCount);
    return `${from}–${to} of ${this.totalCount}`;
  }

  onSearchInput(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => {
      this.pageIndex = 0;
      this.loadPage();
    }, 380);
  }

  refreshPage(): void {
    this.applyDefaultsMessage = '';
    this.applyDefaultsError = false;
    this.loadPage();
  }

  loadPage(): void {
    this.loading = true;
    this.loadError = '';
    this.api
      .listStudentsPortalPage({
        q: this.search.trim() || undefined,
        skip: this.pageIndex * this.pageSize,
        limit: this.pageSize,
      })
      .pipe(
        catchError(() =>
          of({ items: [] as Student[], total: 0, skip: 0, limit: this.pageSize }),
        ),
      )
      .subscribe({
        next: (page) => {
          this.loading = false;
          this.students = page.items;
          this.totalCount = page.total;
          if (page.total === 0 && !this.search.trim()) {
            this.loadError =
              'No students found. Add students first, then configure portal login.';
          } else {
            this.loadError = '';
          }
        },
      });
  }

  goPrev(): void {
    if (this.pageIndex <= 0 || this.loading) return;
    this.pageIndex -= 1;
    this.loadPage();
  }

  goNext(): void {
    if (this.loading || this.pageIndex >= this.totalPages - 1) return;
    this.pageIndex += 1;
    this.loadPage();
  }

  applyDefaultPasswords(): void {
    if (
      !confirm(
        'Set default portal passwords for every student who does not have one yet?\n\n' +
          'Password = full name + date of birth (ISO). If too short, admission number is added.\n' +
          'Students without a password will also have portal access turned on.',
      )
    ) {
      return;
    }
    this.applyingDefaults = true;
    this.applyDefaultsMessage = '';
    this.applyDefaultsError = false;
    this.api.applyPortalLoginDefaults().subscribe({
      next: (r) => {
        this.applyingDefaults = false;
        this.applyDefaultsError = false;
        this.applyDefaultsMessage = `Updated ${r.updated} student(s).`;
        this.loadPage();
      },
      error: (err: unknown) => {
        this.applyingDefaults = false;
        this.applyDefaultsError = true;
        const msg =
          err instanceof HttpErrorResponse
            ? typeof err.error?.detail === 'string'
              ? err.error.detail
              : err.message
            : 'Could not apply defaults.';
        this.applyDefaultsMessage = msg;
      },
    });
  }

  effectiveLoginId(s: Student): string {
    const u = (s.login_username || '').trim();
    return u || (s.admission_no || '').trim() || '—';
  }

  /** Normalize API values (bool, 0/1, legacy strings). */
  isPortalAccessOn(s: Student): boolean {
    const v = s.login_enabled as unknown;
    if (v === true || v === 1) return true;
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      return t === 'true' || t === '1' || t === 'yes';
    }
    return false;
  }

  hasPortalPassword(s: Student): boolean {
    const v = s.has_login_password as unknown;
    if (v === true || v === 1) return true;
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      return t === 'true' || t === '1';
    }
    return false;
  }

  classLine(s: Student): string {
    const cls = (s.class_name || '').trim();
    const sec = (s.section || '').trim();
    return sec ? `${cls} · ${sec}` : cls || '—';
  }

  defaultPasswordHint(st: Student): string {
    const name = (st.full_name || '').trim();
    const dob = (st.date_of_birth || '').trim();
    const adm = (st.admission_no || '').trim();
    let base = `${name}${dob}`;
    if (base.length < 6) base = `${name}${dob}${adm}`;
    return base || '—';
  }

  dismissPortalBanner(): void {
    this.portalAccessBanner = null;
  }

  setPortalAccess(s: Student, enabled: boolean): void {
    if (this.portalToggleBusyId !== null || this.saving) return;
    if (this.isPortalAccessOn(s) === enabled) return;
    this.portalToggleBusyId = s.id;
    this.portalAccessBanner = null;
    this.api
      .patchStudentPortalLogin(s.id, {
        login_enabled: enabled,
        clear_password: false,
      })
      .subscribe({
        next: (updated) => {
          this.portalToggleBusyId = null;
          this.students = this.students.map((row) =>
            row.id === updated.id ? updated : row,
          );
          if (this.editStudent?.id === updated.id) {
            this.editStudent = updated;
          }
          this.portalAccessBanner = {
            text: enabled
              ? `Portal access on for ${updated.full_name}.`
              : `Portal access off for ${updated.full_name}.`,
            error: false,
          };
        },
        error: (err: unknown) => {
          this.portalToggleBusyId = null;
          const msg =
            err instanceof HttpErrorResponse
              ? typeof err.error?.detail === 'string'
                ? err.error.detail
                : err.message
              : 'Could not update portal access.';
          this.portalAccessBanner = { text: msg, error: true };
        },
      });
  }

  openEdit(s: Student): void {
    this.editStudent = s;
    this.formUsername = (s.login_username || '').trim();
    this.formPassword = '';
    this.formPassword2 = '';
    this.showPwd1 = false;
    this.showPwd2 = false;
    this.saveError = '';
    this.dialogOpen = true;
  }

  closeDialog(): void {
    this.dialogOpen = false;
    this.editStudent = null;
    this.saveError = '';
    this.saving = false;
    this.showPwd1 = false;
    this.showPwd2 = false;
  }

  save(): void {
    const s = this.editStudent;
    if (!s || this.saving) return;
    this.saveError = '';

    if (!this.isPortalAccessOn(s)) {
      this.saveError =
        'Turn portal access on above before setting login id or password.';
      return;
    }

    const hasPwd = this.hasPortalPassword(s);
    const pw = this.formPassword.trim();
    const p2 = this.formPassword2.trim();
    if (!hasPwd && !pw) {
      this.saveError =
        'Enter a password (at least 6 characters), or turn portal access off if login is not needed.';
      return;
    }
    if (pw || p2) {
      if (pw.length < 6) {
        this.saveError = 'Password must be at least 6 characters.';
        return;
      }
      if (pw !== p2) {
        this.saveError = 'Passwords do not match.';
        return;
      }
    }

    this.saving = true;
    this.api
      .patchStudentPortalLogin(s.id, {
        login_enabled: true,
        login_username: this.formUsername.trim(),
        new_password: pw || undefined,
        clear_password: false,
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.closeDialog();
          this.loadPage();
        },
        error: (err: unknown) => {
          this.saving = false;
          const msg =
            err instanceof HttpErrorResponse
              ? typeof err.error?.detail === 'string'
                ? err.error.detail
                : err.message
              : 'Could not save login settings.';
          this.saveError = msg;
        },
      });
  }
}
