import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ApiService, SchoolClassRow } from '../core/api.service';
import { SchoolRefService } from '../core/school-ref.service';

interface SubRow {
  subjectName: string;
  totalMarks: string;
}

@Component({
  selector: 'app-assign-subjects',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './assign-subjects.component.html',
  styleUrls: ['./pages-shared.scss', './class-list.component.scss', './assign-subjects.component.scss'],
})
export class AssignSubjectsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly schoolRef = inject(SchoolRefService);
  private readonly route = inject(ActivatedRoute);

  selectedClassId: number | null = null;
  rows: SubRow[] = [];
  err = '';
  busy = false;

  ngOnInit(): void {
    this.resetRowsToTemplate();
    this.route.queryParamMap.subscribe(() => {
      const raw = this.route.snapshot.queryParamMap.get('classId');
      if (raw) {
        const n = +raw;
        this.selectedClassId = Number.isFinite(n) && n > 0 ? n : null;
      } else {
        this.selectedClassId = null;
      }
      this.loadSubjectsForClass();
    });
  }

  get sortedClasses(): SchoolClassRow[] {
    return [...this.schoolRef.classes()].sort(
      (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    );
  }

  resetRowsToTemplate(): void {
    this.rows = Array.from({ length: 4 }, () => ({ subjectName: '', totalMarks: '' }));
  }

  loadSubjectsForClass(): void {
    this.err = '';
    if (this.selectedClassId == null) {
      this.resetRowsToTemplate();
      return;
    }
    this.api
      .listClassSubjects(this.selectedClassId)
      .pipe(catchError(() => of([])))
      .subscribe((list) => {
        if (list.length) {
          this.rows = list.map((s) => ({
            subjectName: s.subject_name,
            totalMarks: s.total_marks || '',
          }));
        } else {
          this.resetRowsToTemplate();
        }
      });
  }

  addRow(): void {
    this.rows.push({ subjectName: '', totalMarks: '' });
  }

  removeRow(): void {
    if (this.rows.length > 1) {
      this.rows.pop();
    }
  }

  save(): void {
    if (this.selectedClassId == null) {
      this.err = 'Please select a class.';
      return;
    }
    const payloadRows = this.rows
      .map((r) => ({
        subject_name: r.subjectName.trim(),
        total_marks: r.totalMarks.trim(),
      }))
      .filter((r) => r.subject_name.length > 0);
    this.err = '';
    this.busy = true;
    this.api
      .putClassSubjects(this.selectedClassId, { rows: payloadRows })
      .pipe(catchError(() => of(null)))
      .subscribe({
        next: (res) => {
          this.busy = false;
          if (!res) {
            this.err = 'Save failed (duplicate subject name?).';
            return;
          }
          this.loadSubjectsForClass();
        },
        error: () => {
          this.busy = false;
          this.err = 'Save failed.';
        },
      });
  }
}
