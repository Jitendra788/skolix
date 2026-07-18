import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { ApiService, Homework, Notice } from '../core/api.service';
import { SessionService } from '../core/session.service';
import { homeworkDescriptionPreview } from '../core/homework-description.util';

@Component({
  selector: 'app-teacher-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './teacher-home.component.html',
  styleUrls: ['./pages-shared.scss', './portal-home.shared.scss', './teacher-home.component.scss'],
})
export class TeacherHomeComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  loading = false;
  todayHomeworkCount = 0;
  todayAttendanceCount = 0;
  totalNotices = 0;
  latestNotices: Notice[] = [];
  latestHomework: Homework[] = [];
  todayIso = new Date().toISOString().slice(0, 10);

  ngOnInit(): void {
    this.loading = true;
    forkJoin({
      hw: this.api.getHomeworks({ date: this.todayIso }).pipe(catchError(() => of([]))),
      at: this.api.listAttendance({ onDate: this.todayIso }).pipe(catchError(() => of([]))),
      notices: this.api.listNotices().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ hw, at, notices }) => {
        this.loading = false;
        this.todayHomeworkCount = hw.length;
        this.todayAttendanceCount = at.length;
        this.totalNotices = notices.length;
        const byCreated = (a: { created_at?: string }, b: { created_at?: string }) =>
          (b.created_at || '').localeCompare(a.created_at || '');
        this.latestHomework = [...hw].sort(byCreated).slice(0, 4);
        this.latestNotices = [...notices].sort(byCreated).slice(0, 5);
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  displayName(): string {
    return this.session.displayName() || 'Teacher';
  }

  greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  todayLabel(): string {
    return new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }

  formatShortDate(iso: string): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  }

  truncate(text: string, max = 72): string {
    const t = (text || '').trim();
    return t.length <= max ? t : `${t.slice(0, max).trim()}…`;
  }

  homeworkPreview(html: string | null | undefined, max = 72): string {
    return homeworkDescriptionPreview(html, max);
  }

}
