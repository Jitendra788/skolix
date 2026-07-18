import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  catchError,
  combineLatest,
  map,
  of,
  shareReplay,
  take,
} from 'rxjs';
import {
  ApiService,
  DashboardSummary,
  Faculty,
  InstituteProfile,
  SchoolHoliday,
  Student,
} from '../core/api.service';
import { studentsPerClass, type ClassCountRow } from '../core/dashboard-charts';
import { buildUpcomingMilestones, type DashboardMilestone } from '../core/upcoming-milestones';

export interface DashboardVm {
  health: string;
  notices: { id: number; title: string; body: string; pinned: boolean; created_at: string }[];
  students: number;
  faculty: number;
  milestones: DashboardMilestone[];
  summary: DashboardSummary | null;
  classRows: ClassCountRow[];
  instituteName: string;
  profileEmail: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [AsyncPipe, DatePipe, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly api = inject(ApiService);

  readonly dashCalYm = signal(this.formatYm(new Date()));
  readonly dashHolidays = signal<SchoolHoliday[]>([]);

  constructor() {
    effect(() => {
      const ym = this.dashCalYm();
      this.api
        .listHolidaysInMonth(ym)
        .pipe(take(1), catchError(() => of<SchoolHoliday[]>([])))
        .subscribe((h) => this.dashHolidays.set(h));
    });
  }

  calNav(delta: number): void {
    const [y, m] = this.dashCalYm().split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    this.dashCalYm.set(this.formatYm(d));
  }

  calTitle(): string {
    const [y, m] = this.dashCalYm().split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  }

  calSubLabel(): string {
    const t = new Date();
    const [y, m] = this.dashCalYm().split('-').map(Number);
    if (t.getFullYear() === y && t.getMonth() === m - 1) {
      return t.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return '';
  }

  calendarWeeks(): { day: number | null; isToday: boolean; holi: string }[][] {
    const [y, m] = this.dashCalYm().split('-').map(Number);
    const first = new Date(y, m - 1, 1).getDay();
    const dim = new Date(y, m, 0).getDate();
    const holis = this.dashHolidays();
    const holiByDay = new Map<number, string>();
    for (const h of holis) {
      const d = new Date(h.holiday_date + 'T12:00:00');
      if (d.getFullYear() === y && d.getMonth() === m - 1) {
        holiByDay.set(d.getDate(), h.name);
      }
    }
    const today = new Date();
    const cells: { day: number | null; isToday: boolean; holi: string }[] = [];
    for (let i = 0; i < first; i++) {
      cells.push({ day: null, isToday: false, holi: '' });
    }
    for (let d = 1; d <= dim; d++) {
      const isToday =
        today.getDate() === d &&
        today.getMonth() === m - 1 &&
        today.getFullYear() === y;
      cells.push({ day: d, isToday, holi: holiByDay.get(d) ?? '' });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: null, isToday: false, holi: '' });
    }
    while (cells.length < 42) {
      cells.push({ day: null, isToday: false, holi: '' });
    }
    const weeks: { day: number | null; isToday: boolean; holi: string }[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  }

  initials(name: string): string {
    const p = name.trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '?';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }

  private formatYm(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  readonly vm$ = combineLatest({
    health: this.api.health().pipe(
      map((h) => h.status),
      catchError(() => of('offline')),
      shareReplay(1)
    ),
    notices: this.api.listNotices().pipe(
      catchError(() => of([])),
      shareReplay(1)
    ),
    facultyRows: this.api.listFaculty().pipe(
      catchError(() => of<Faculty[]>([])),
      shareReplay(1)
    ),
    studentRows: this.api.listStudents().pipe(
      catchError(() => of<Student[]>([])),
      shareReplay(1)
    ),
    profile: this.api.getInstituteProfile().pipe(
      catchError(() => of<InstituteProfile | null>(null)),
      shareReplay(1)
    ),
    summary: this.api.getDashboardSummary().pipe(
      catchError(() => of<DashboardSummary | null>(null)),
      shareReplay(1)
    ),
  }).pipe(
    map((raw) => {
      const milestones = buildUpcomingMilestones({
        instituteName: raw.profile?.name ?? '',
        establishedOn: raw.profile?.established_on ?? '',
        students: raw.studentRows.map((s) => ({
          full_name: s.full_name,
          class_name: s.class_name,
          date_of_birth: s.date_of_birth ?? '',
        })),
        faculty: raw.facultyRows.map((f) => ({
          name: f.name,
          date_of_birth: f.date_of_birth ?? '',
        })),
      });
      const summary = raw.summary;
      const vm: DashboardVm = {
        health: raw.health,
        notices: raw.notices,
        students: raw.studentRows.length,
        faculty: raw.facultyRows.length,
        milestones,
        summary,
        classRows: studentsPerClass(raw.studentRows),
        instituteName: raw.profile?.name?.trim() ?? '',
        profileEmail: raw.profile?.email?.trim() ?? '',
      };
      return vm;
    }),
    shareReplay(1)
  );
}
