import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, of, switchMap } from 'rxjs';
import { ApiService, Faculty, FacultyPayload } from '../core/api.service';

const MAX_PHOTO_BYTES = 100 * 1024;

@Component({
  selector: 'app-faculty',
  standalone: true,
  imports: [AsyncPipe, FormsModule, RouterLink],
  templateUrl: './faculty.component.html',
  styleUrl: './faculty.component.scss',
})
export class FacultyComponent {
  private readonly api = inject(ApiService);
  private readonly refresh$ = new BehaviorSubject<void>(undefined);

  readonly roleOptions = [
    'Teacher',
    'Principal',
    'Vice principal',
    'Administrator',
    'Clerk',
    'Librarian',
    'Lab assistant',
    'Sports coach',
    'Other',
  ];

  readonly genderOptions = ['Male', 'Female', 'Other', 'Prefer not to say'];

  readonly bloodOptions = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

  readonly religionOptions = [
    'Hindu',
    'Muslim',
    'Christian',
    'Sikh',
    'Buddhist',
    'Jain',
    'Other',
  ];

  name = '';
  phone = '';
  designation = '';
  subject = '';
  class_assigned = '';
  email = '';
  photo_url = '';
  photoData: string | null = null;
  photoErr = '';
  date_joining = '';
  monthly_salary = '';
  guardian_name = '';
  gender = '';
  experience = '';
  national_id = '';
  religion = '';
  education = '';
  blood_group = '';
  date_of_birth = '';
  home_address = '';

  editingId: number | null = null;
  saving = false;
  error = '';

  readonly faculty$ = this.refresh$.pipe(
    switchMap(() =>
      this.api.listFaculty().pipe(catchError(() => of<Faculty[]>([])))
    )
  );

  constructor() {
    this.resetDatesForNew();
  }

  private todayISO(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private resetDatesForNew(): void {
    if (!this.date_joining) {
      this.date_joining = this.todayISO();
    }
  }

  private hasPicture(): boolean {
    return !!(this.photoData || this.photo_url.trim());
  }

  private isValidEmail(v: string): boolean {
    const s = v.trim();
    if (!s) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  private payload(): FacultyPayload {
    return {
      name: this.name.trim(),
      designation: this.designation.trim(),
      subject: this.subject.trim(),
      class_assigned: this.class_assigned.trim(),
      phone: this.phone.trim(),
      email: this.email.trim(),
      photo_url: this.photo_url.trim(),
      photo_data: this.photoData,
      date_joining: this.date_joining.trim(),
      monthly_salary: this.monthly_salary.trim(),
      guardian_name: this.guardian_name.trim(),
      gender: this.gender.trim(),
      experience: this.experience.trim(),
      national_id: this.national_id.trim(),
      religion: this.religion.trim(),
      education: this.education.trim(),
      blood_group: this.blood_group.trim(),
      date_of_birth: this.date_of_birth.trim(),
      home_address: this.home_address.trim(),
    };
  }

  onPictureChange(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.photoErr = '';
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.photoErr = 'Please choose an image file.';
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      this.photoErr = 'Max size 100KB.';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      this.photoData = typeof r === 'string' ? r : null;
    };
    reader.readAsDataURL(file);
  }

  clearPicture(): void {
    this.photoData = null;
    this.photoErr = '';
  }

  resetForm(): void {
    this.editingId = null;
    this.name = '';
    this.phone = '';
    this.designation = '';
    this.subject = '';
    this.class_assigned = '';
    this.email = '';
    this.photo_url = '';
    this.photoData = null;
    this.photoErr = '';
    this.date_joining = this.todayISO();
    this.monthly_salary = '';
    this.guardian_name = '';
    this.gender = '';
    this.experience = '';
    this.national_id = '';
    this.religion = '';
    this.education = '';
    this.blood_group = '';
    this.date_of_birth = '';
    this.home_address = '';
    this.error = '';
  }

  edit(p: Faculty): void {
    this.editingId = p.id;
    this.name = p.name;
    this.phone = p.phone ?? '';
    this.designation = p.designation;
    this.subject = p.subject ?? '';
    this.class_assigned = p.class_assigned ?? '';
    this.email = p.email ?? '';
    this.photo_url = p.photo_url ?? '';
    this.photoData = p.photo_data ?? null;
    this.photoErr = '';
    this.date_joining = (p.date_joining || '').trim() || this.todayISO();
    this.monthly_salary = p.monthly_salary ?? '';
    this.guardian_name = p.guardian_name ?? '';
    this.gender = p.gender ?? '';
    this.experience = p.experience ?? '';
    this.national_id = p.national_id ?? '';
    this.religion = p.religion ?? '';
    this.education = p.education ?? '';
    this.blood_group = p.blood_group ?? '';
    this.date_of_birth = (p.date_of_birth ?? '').trim();
    this.home_address = p.home_address ?? '';
    this.error = '';
  }

  save(): void {
    if (!this.name.trim()) {
      this.error = 'Employee name is required.';
      return;
    }
    if (!this.hasPicture()) {
      this.error = 'Picture is required: upload an image (max 100KB) or paste a photo URL.';
      return;
    }
    if (!this.phone.trim()) {
      this.error = 'Mobile number for SMS/WhatsApp is required.';
      return;
    }
    if (!this.date_joining.trim()) {
      this.error = 'Date of joining is required.';
      return;
    }
    if (!this.designation.trim()) {
      this.error = 'Employee role is required.';
      return;
    }
    if (!this.monthly_salary.trim()) {
      this.error = 'Monthly salary is required.';
      return;
    }
    if (!this.guardian_name.trim()) {
      this.error = 'Father / husband name is required.';
      return;
    }
    if (!this.national_id.trim()) {
      this.error = 'National ID is required.';
      return;
    }
    if (!this.education.trim()) {
      this.error = 'Education is required.';
      return;
    }
    if (!this.gender.trim()) {
      this.error = 'Gender is required.';
      return;
    }
    if (!this.religion.trim()) {
      this.error = 'Religion is required.';
      return;
    }
    if (!this.blood_group.trim()) {
      this.error = 'Blood group is required.';
      return;
    }
    if (!this.experience.trim()) {
      this.error = 'Experience is required.';
      return;
    }
    if (!this.isValidEmail(this.email)) {
      this.error = 'A valid email address is required.';
      return;
    }
    if (!this.date_of_birth.trim()) {
      this.error = 'Date of birth is required.';
      return;
    }
    if (!this.home_address.trim()) {
      this.error = 'Home address is required.';
      return;
    }
    this.error = '';
    this.saving = true;
    const body = this.payload();
    const req =
      this.editingId != null
        ? this.api.updateFaculty(this.editingId, body)
        : this.api.createFaculty(body);
    req.subscribe({
      next: () => {
        this.saving = false;
        this.resetForm();
        this.refresh$.next();
      },
      error: () => {
        this.saving = false;
        this.error = 'Save failed.';
      },
    });
  }

  remove(p: Faculty): void {
    if (!confirm(`Remove ${p.name} from directory?`)) return;
    this.api.deleteFaculty(p.id).subscribe({
      next: () => {
        if (this.editingId === p.id) this.resetForm();
        this.refresh$.next();
      },
    });
  }

  staffPhotoSrc(p: Faculty): string | null {
    return p.photo_data || p.photo_url || null;
  }
}
