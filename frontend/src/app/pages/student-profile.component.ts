import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { ApiService, Student } from '../core/api.service';
import { SessionService } from '../core/session.service';

@Component({
  selector: 'app-student-profile',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './student-profile.component.html',
  styleUrls: ['./student-home.component.scss', './student-profile.component.scss'],
  host: { class: 'student-profile-host' },
})
export class StudentProfileComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  loading = false;
  saving = false;
  error = '';
  savedMsg = '';
  profile: Student | null = null;
  readonly draft = {
    full_name: '',
    parent_name: '',
    parent_phone: '',
    date_of_birth: '',
    gender: '',
    profile_photo_url: '',
  };

  ngOnInit(): void {
    const id = Number(this.session.userId() || 0);
    if (!id) return;
    this.loading = true;
    this.api
      .getStudent(id)
      .pipe(catchError(() => of(null)))
      .subscribe((st) => {
        this.loading = false;
        if (!st) {
          this.error = 'Could not load profile.';
          return;
        }
        this.applyStudent(st);
      });
  }

  private applyStudent(st: Student): void {
    this.profile = st;
    this.draft.full_name = st.full_name;
    this.draft.parent_name = st.parent_name || '';
    this.draft.parent_phone = st.parent_phone || '';
    this.draft.date_of_birth = st.date_of_birth || '';
    this.draft.gender = st.gender || '';
    const ex = st.admission_extras as Record<string, unknown> | undefined;
    this.draft.profile_photo_url = String(ex?.['portal_photo_url'] ?? '');
  }

  displayName(): string {
    return this.session.displayName() || 'Student';
  }

  userInitial(): string {
    const n = this.displayName().trim();
    return n ? n.charAt(0).toUpperCase() : 'S';
  }

  profilePhotoUrl(): string | null {
    const u = this.draft.profile_photo_url.trim();
    return u || null;
  }

  discardChanges(): void {
    if (!this.profile) return;
    this.error = '';
    this.savedMsg = '';
    this.applyStudent(this.profile);
  }

  save(): void {
    const id = Number(this.session.userId() || 0);
    if (!id || !this.draft.full_name.trim()) {
      this.error = 'Full name is required.';
      return;
    }
    this.saving = true;
    this.error = '';
    this.savedMsg = '';
    this.api
      .patchStudentSelfProfile(id, {
        full_name: this.draft.full_name.trim(),
        parent_name: this.draft.parent_name.trim(),
        parent_phone: this.draft.parent_phone.trim(),
        date_of_birth: this.draft.date_of_birth.trim(),
        gender: this.draft.gender.trim(),
        profile_photo_url: this.draft.profile_photo_url.trim(),
      })
      .subscribe({
        next: (st) => {
          this.saving = false;
          this.applyStudent(st);
          this.session.updateDisplayName(st.full_name);
          this.savedMsg = 'Profile saved.';
        },
        error: () => {
          this.saving = false;
          this.error = 'Save failed. Stay logged in and try again.';
        },
      });
  }

}
