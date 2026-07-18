import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SchoolRefService } from '../core/school-ref.service';
import {
  ApiService,
  SchoolAcademicYearRow,
  SchoolFeeFrequencyRow,
  SchoolFeeHeadRow,
} from '../core/api.service';

export type SchoolSetupTab = 'years' | 'fee_heads' | 'fee_frequencies';

@Component({
  selector: 'app-school-setup',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './school-setup.component.html',
  styleUrl: './school-setup.component.scss',
})
export class SchoolSetupComponent {
  readonly api = inject(ApiService);
  readonly schoolRef = inject(SchoolRefService);

  setupTab: SchoolSetupTab = 'years';

  yearLabel = '';
  yearSort = 0;
  yearCurrent = false;
  editingYear: SchoolAcademicYearRow | null = null;
  headName = '';
  headSort = 0;
  freqName = '';
  freqSort = 0;
  editingHead: SchoolFeeHeadRow | null = null;
  editingFreq: SchoolFeeFrequencyRow | null = null;

  yearBusy = false;
  headBusy = false;
  freqBusy = false;
  yearErr = '';
  headErr = '';
  freqErr = '';

  startEditYear(y: SchoolAcademicYearRow): void {
    this.editingYear = y;
    this.yearLabel = y.label;
    this.yearSort = y.sort_order;
    this.yearCurrent = y.is_current;
    this.yearErr = '';
  }

  cancelYear(): void {
    this.editingYear = null;
    this.yearLabel = '';
    this.yearSort = 0;
    this.yearCurrent = false;
    this.yearErr = '';
  }

  saveYear(): void {
    const label = this.yearLabel.trim();
    if (!label) {
      this.yearErr = 'Label is required.';
      return;
    }
    this.yearErr = '';
    this.yearBusy = true;
    const body = {
      label,
      sort_order: Number(this.yearSort) || 0,
      is_current: this.yearCurrent,
    };
    const req = this.editingYear
      ? this.api.updateSchoolAcademicYear(this.editingYear.id, body)
      : this.api.createSchoolAcademicYear(body);
    req.subscribe({
      next: () => {
        this.yearBusy = false;
        this.cancelYear();
        this.schoolRef.loadAll();
      },
      error: () => {
        this.yearBusy = false;
        this.yearErr = 'Save failed (duplicate label?).';
      },
    });
  }

  removeYear(y: SchoolAcademicYearRow): void {
    if (!confirm(`Delete academic year "${y.label}"?`)) return;
    this.api.deleteSchoolAcademicYear(y.id).subscribe({
      next: () => this.schoolRef.loadAll(),
    });
  }

  startEditHead(h: SchoolFeeHeadRow): void {
    this.editingHead = h;
    this.headName = h.name;
    this.headSort = h.sort_order;
    this.headErr = '';
  }

  cancelHead(): void {
    this.editingHead = null;
    this.headName = '';
    this.headSort = 0;
    this.headErr = '';
  }

  saveHead(): void {
    const name = this.headName.trim();
    if (!name) {
      this.headErr = 'Name is required.';
      return;
    }
    this.headErr = '';
    this.headBusy = true;
    const body = {
      name,
      sort_order: Number(this.headSort) || 0,
      prefix_amount: this.editingHead?.prefix_amount ?? '0',
      is_locked: this.editingHead?.is_locked ?? false,
    };
    const req = this.editingHead
      ? this.api.updateSchoolFeeHead(this.editingHead.id, body)
      : this.api.createSchoolFeeHead({
          name,
          sort_order: Number(this.headSort) || 0,
          prefix_amount: '0',
          is_locked: false,
        });
    req.subscribe({
      next: () => {
        this.headBusy = false;
        this.cancelHead();
        this.schoolRef.loadAll();
      },
      error: () => {
        this.headBusy = false;
        this.headErr = 'Save failed (duplicate name?).';
      },
    });
  }

  removeHead(h: SchoolFeeHeadRow): void {
    if (!confirm(`Delete fee head "${h.name}"?`)) return;
    this.api.deleteSchoolFeeHead(h.id).subscribe({
      next: () => this.schoolRef.loadAll(),
    });
  }

  startEditFreq(f: SchoolFeeFrequencyRow): void {
    this.editingFreq = f;
    this.freqName = f.name;
    this.freqSort = f.sort_order;
    this.freqErr = '';
  }

  cancelFreq(): void {
    this.editingFreq = null;
    this.freqName = '';
    this.freqSort = 0;
    this.freqErr = '';
  }

  saveFreq(): void {
    const name = this.freqName.trim();
    if (!name) {
      this.freqErr = 'Name is required.';
      return;
    }
    this.freqErr = '';
    this.freqBusy = true;
    const body = { name, sort_order: Number(this.freqSort) || 0 };
    const req = this.editingFreq
      ? this.api.updateSchoolFeeFrequency(this.editingFreq.id, body)
      : this.api.createSchoolFeeFrequency(body);
    req.subscribe({
      next: () => {
        this.freqBusy = false;
        this.cancelFreq();
        this.schoolRef.loadAll();
      },
      error: () => {
        this.freqBusy = false;
        this.freqErr = 'Save failed (duplicate name?).';
      },
    });
  }

  removeFreq(f: SchoolFeeFrequencyRow): void {
    if (!confirm(`Delete frequency "${f.name}"?`)) return;
    this.api.deleteSchoolFeeFrequency(f.id).subscribe({
      next: () => this.schoolRef.loadAll(),
    });
  }
}
