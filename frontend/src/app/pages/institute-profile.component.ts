import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { ApiService, InstituteProfilePayload } from '../core/api.service';

@Component({
  selector: 'app-institute-profile',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './institute-profile.component.html',
  styleUrl: './institute-profile.component.scss',
})
export class InstituteProfileComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly countries = [
    'India',
    'United States',
    'United Kingdom',
    'Canada',
    'Australia',
    'United Arab Emirates',
    'Singapore',
    'Other',
  ];

  logoData = '';
  name = '';
  tagline = '';
  phone = '';
  email = '';
  website = '';
  address = '';
  country = '';
  established_on = '';

  loading = false;
  saving = false;
  err = '';
  ok = '';
  logoErr = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.err = '';
    this.loading = true;
    this.api
      .getInstituteProfile()
      .pipe(catchError(() => of(null)))
      .subscribe({
        next: (p) => {
          this.loading = false;
          if (!p) {
            this.err = 'Could not load profile. Is the API running?';
            return;
          }
          this.logoData = p.logo_data || '';
          this.name = p.name || '';
          this.tagline = p.tagline || '';
          this.phone = p.phone || '';
          this.email = p.email || '';
          this.website = p.website || '';
          this.address = p.address || '';
          this.country = p.country || '';
          this.established_on = p.established_on || '';
        },
        error: () => {
          this.loading = false;
          this.err = 'Could not load profile.';
        },
      });
  }

  onLogoChange(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    this.logoErr = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      this.logoErr = 'Please choose an image file.';
      return;
    }
    if (file.size > 400 * 1024) {
      this.logoErr = 'Image must be under 400 KB.';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result;
      this.logoData = typeof r === 'string' ? r : '';
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  clearLogo(): void {
    this.logoData = '';
    this.logoErr = '';
  }

  payload(): InstituteProfilePayload {
    return {
      logo_data: this.logoData,
      name: this.name.trim(),
      tagline: this.tagline.trim(),
      phone: this.phone.trim(),
      email: this.email.trim(),
      website: this.website.trim(),
      address: this.address.trim(),
      country: this.country.trim(),
      established_on: this.established_on.trim(),
    };
  }

  save(): void {
    this.err = '';
    this.ok = '';
    if (!this.name.trim() || !this.tagline.trim() || !this.phone.trim() || !this.address.trim()) {
      this.err = 'Please fill all required fields (name, target line, phone, address).';
      return;
    }
    if (!this.country.trim()) {
      this.err = 'Please select a country.';
      return;
    }
    if (!this.email.trim()) {
      this.err = 'Please enter an email address.';
      return;
    }
    this.saving = true;
    this.api.updateInstituteProfile(this.payload()).subscribe({
      next: () => {
        this.saving = false;
        this.ok = 'Profile updated successfully.';
      },
      error: () => {
        this.saving = false;
        this.err = 'Save failed.';
      },
    });
  }

  previewName(): string {
    return this.name.trim() || 'Your institute name';
  }

  previewTagline(): string {
    return this.tagline.trim() || 'Institute target line';
  }

  previewPhone(): string {
    return this.phone.trim() || '----------';
  }

  previewEmail(): string {
    return this.email.trim() || '----------';
  }

  previewLine(v: string): string {
    return v.trim() || '----------';
  }
}
