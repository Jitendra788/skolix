import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { ApiService, Faculty } from '../core/api.service';

@Component({
  selector: 'app-teacher-portal-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './teacher-portal-login.component.html',
  styleUrls: ['./pages-shared.scss', './student-portal-login.component.scss'],
})
export class TeacherPortalLoginComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);

  teachers: Faculty[] = [];
  search = '';
  loading = false;
  loadError = '';

  portalToggleBusyId: number | null = null;
  banner: { text: string; error: boolean } | null = null;

  dialogOpen = false;
  editTeacher: Faculty | null = null;
  formUsername = '';
  formPassword = '';
  formPassword2 = '';
  saveError = '';
  saving = false;

  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadTeachers();
  }

  ngOnDestroy(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
  }

  onSearchInput(): void {
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(() => this.loadTeachers(), 350);
  }

  refreshPage(): void {
    this.loadTeachers();
  }

  loadTeachers(): void {
    this.loading = true;
    this.loadError = '';
    this.api
      .listFaculty({ q: this.search.trim() || undefined, skip: 0, limit: 200 })
      .pipe(catchError(() => of([] as Faculty[])))
      .subscribe({
        next: (rows) => {
          this.loading = false;
          this.teachers = rows;
          if (!rows.length && !this.search.trim()) {
            this.loadError = 'No teachers found. Add faculty first.';
          }
        },
      });
  }

  effectiveLoginId(t: Faculty): string {
    const u = (t.login_username || '').trim();
    if (u) return u;
    const email = (t.email || '').trim();
    if (email) return email;
    const phone = (t.phone || '').trim();
    if (phone) return phone;
    return `teacher-${t.id}`;
  }

  isPortalAccessOn(t: Faculty): boolean {
    return !!t.login_enabled;
  }

  hasPortalPassword(t: Faculty): boolean {
    return !!t.has_login_password;
  }

  defaultPasswordHint(t: Faculty): string {
    const name = (t.name || '').trim().replace(/\s+/g, '');
    const dob = (t.date_of_birth || '').trim();
    const phone = (t.phone || '').trim();
    let base = `${name}${dob}`;
    if (base.length < 6) base = `${name}${phone}`;
    return base || 'teacher-portal';
  }

  dismissBanner(): void {
    this.banner = null;
  }

  setPortalAccess(t: Faculty, enabled: boolean): void {
    if (this.portalToggleBusyId !== null || this.saving) return;
    if (this.isPortalAccessOn(t) === enabled) return;
    this.portalToggleBusyId = t.id;
    this.banner = null;
    this.api
      .patchFacultyPortalLogin(t.id, {
        login_enabled: enabled,
        clear_password: false,
      })
      .subscribe({
        next: (updated) => {
          this.portalToggleBusyId = null;
          this.teachers = this.teachers.map((row) => (row.id === updated.id ? updated : row));
          if (this.editTeacher?.id === updated.id) this.editTeacher = updated;
          this.banner = {
            text: enabled ? `Portal access on for ${updated.name}.` : `Portal access off for ${updated.name}.`,
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
          this.banner = { text: msg, error: true };
        },
      });
  }

  openEdit(t: Faculty): void {
    this.editTeacher = t;
    this.formUsername = (t.login_username || '').trim();
    this.formPassword = '';
    this.formPassword2 = '';
    this.saveError = '';
    this.dialogOpen = true;
  }

  closeDialog(): void {
    this.dialogOpen = false;
    this.editTeacher = null;
    this.saveError = '';
    this.saving = false;
  }

  clearPassword(t: Faculty): void {
    if (this.saving) return;
    this.saving = true;
    this.saveError = '';
    this.api
      .patchFacultyPortalLogin(t.id, {
        login_enabled: false,
        clear_password: true,
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.closeDialog();
          this.loadTeachers();
        },
        error: () => {
          this.saving = false;
          this.saveError = 'Could not clear password.';
        },
      });
  }

  save(): void {
    const t = this.editTeacher;
    if (!t || this.saving) return;
    this.saveError = '';
    if (!this.isPortalAccessOn(t)) {
      this.saveError = 'Turn portal access on before saving credentials.';
      return;
    }
    const pw = this.formPassword.trim();
    const p2 = this.formPassword2.trim();
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
      .patchFacultyPortalLogin(t.id, {
        login_enabled: true,
        login_username: this.formUsername.trim(),
        new_password: pw || undefined,
        clear_password: false,
      })
      .subscribe({
        next: () => {
          this.saving = false;
          this.closeDialog();
          this.loadTeachers();
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
