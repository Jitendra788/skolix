import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiService, Student } from '../core/api.service';
import { SessionService } from '../core/session.service';
import {
  TtCell,
  TtPeriodRow,
  TtWeekdayRow,
  loadActiveWeekdays,
  loadPeriods,
  resolveStudentTimetable,
} from '../core/timetable-local.util';
import { StudentTimetableGridComponent } from './student-timetable-grid.component';

@Component({
  selector: 'app-student-timetable-page',
  standalone: true,
  imports: [StudentTimetableGridComponent],
  templateUrl: './student-timetable-page.component.html',
  styleUrls: ['./student-home.component.scss', './student-timetable-page.component.scss'],
})
export class StudentTimetablePageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  loading = false;
  profile: Student | null = null;
  ttDays: TtWeekdayRow[] = [];
  ttPeriods: TtPeriodRow[] = [];
  ttCells: Record<string, TtCell> = {};
  ttLabel = '';
  ttNoMatch = false;

  ngOnInit(): void {
    const id = Number(this.session.userId() || 0);
    if (!id) {
      this.router.navigateByUrl('/login/student');
      return;
    }
    this.loading = true;
    forkJoin({
      st: this.api.getStudent(id).pipe(catchError(() => of(null))),
      schoolClasses: this.api.listSchoolClasses().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ st, schoolClasses }) => {
        this.loading = false;
        if (!st) {
          this.router.navigateByUrl('/login/student');
          return;
        }
        this.profile = st;
        const pt = resolveStudentTimetable(st.class_name, st.section, schoolClasses);
        this.ttCells = pt.cells;
        this.ttLabel = pt.label;
        this.ttNoMatch = pt.noClassMatch;
        this.ttDays = loadActiveWeekdays();
        this.ttPeriods = loadPeriods();
      },
      error: () => {
        this.loading = false;
      },
    });
  }

}
