import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, StudentBulkImportResult } from '../core/api.service';
import { SchoolRefService } from '../core/school-ref.service';

@Component({
  selector: 'app-student-import',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './student-import.component.html',
  styleUrls: ['./pages-shared.scss', './student-import.component.scss'],
})
export class StudentImportComponent {
  private readonly api = inject(ApiService);
  private readonly schoolRef = inject(SchoolRefService);

  @ViewChild('importFileInput') importFileInput?: ElementRef<HTMLInputElement>;

  selectedImportFile: File | null = null;
  bulkImportLoading = false;
  bulkImportError = '';
  bulkImportResult: StudentBulkImportResult | null = null;

  downloadImportTemplate(fmt: 'csv' | 'xlsx'): void {
    this.bulkImportError = '';
    const name =
      fmt === 'csv'
        ? 'student_admission_import_sample.csv'
        : 'student_admission_import_sample.xlsx';
    this.api.getStudentImportTemplate(fmt).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.bulkImportError = 'Could not download the sample file.';
      },
    });
  }

  onImportFileChange(ev: Event): void {
    this.bulkImportError = '';
    this.bulkImportResult = null;
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      this.selectedImportFile = null;
      return;
    }
    const low = file.name.toLowerCase();
    if (!low.endsWith('.csv') && !low.endsWith('.xlsx')) {
      this.bulkImportError = 'Only .csv or .xlsx files are supported.';
      input.value = '';
      this.selectedImportFile = null;
      return;
    }
    this.selectedImportFile = file;
  }

  clearImportSelection(): void {
    this.selectedImportFile = null;
    this.bulkImportResult = null;
    this.bulkImportError = '';
    const el = this.importFileInput?.nativeElement;
    if (el) el.value = '';
  }

  runBulkImport(): void {
    const file = this.selectedImportFile;
    if (!file) {
      this.bulkImportError = 'Choose a CSV or Excel file to upload.';
      return;
    }
    const low = file.name.toLowerCase();
    if (!low.endsWith('.csv') && !low.endsWith('.xlsx')) {
      this.bulkImportError = 'Only .csv or .xlsx files are supported.';
      return;
    }
    this.bulkImportLoading = true;
    this.bulkImportError = '';
    this.bulkImportResult = null;
    this.api.bulkImportStudents(file).subscribe({
      next: (r) => {
        this.bulkImportLoading = false;
        this.bulkImportResult = r;
        this.schoolRef.invalidateRosterCache();
      },
      error: (e: HttpErrorResponse) => {
        this.bulkImportLoading = false;
        const body = e.error;
        if (typeof body === 'object' && body && 'detail' in body) {
          const d = (body as { detail?: unknown }).detail;
          this.bulkImportError =
            typeof d === 'string' ? d : 'Import could not be processed.';
        } else {
          this.bulkImportError = 'Import failed. Check the file and try again.';
        }
      },
    });
  }

  dismissBulkImportSummary(): void {
    this.bulkImportResult = null;
  }
}
