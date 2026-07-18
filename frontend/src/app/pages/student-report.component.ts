import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of, switchMap } from 'rxjs';
import { classTestSubjectsForStudent } from '../core/class-test-local.util';
import {
  ApiService,
  StudentReport,
  StudentReportAttendance,
} from '../core/api.service';

@Component({
  selector: 'app-student-report',
  standalone: true,
  imports: [AsyncPipe, RouterLink],
  templateUrl: './student-report.component.html',
  styleUrl: './student-report.component.scss',
})
export class StudentReportComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  readonly report$ = this.route.paramMap.pipe(
    map((p) => Number(p.get('studentId'))),
    switchMap((id) =>
      Number.isFinite(id) && id > 0
        ? this.api.getStudentReport(id).pipe(catchError(() => of(null)))
        : of(null)
    ),
    map((r) => {
      if (!r) return null;
      const local = classTestSubjectsForStudent(r.profile.id, r.profile.class_name);
      if (!local.length) return r;
      return { ...r, class_tests: local };
    })
  );

  printPdf(): void {
    window.print();
  }

  donutGradient(att: StudentReportAttendance): string {
    const t = att.presents_total + att.leaves_total + att.absents_total;
    if (t <= 0) {
      return 'conic-gradient(#e2e8f0 0deg 360deg)';
    }
    const p = (att.presents_total / t) * 360;
    const l = (att.leaves_total / t) * 360;
    return `conic-gradient(#2563eb 0deg ${p}deg, #93c5fd ${p}deg ${p + l}deg, #fb7185 ${p + l}deg 360deg)`;
  }

  gaugeStyle(pct: number): string {
    const p = Math.max(0, Math.min(100, pct));
    return `conic-gradient(#7c3aed 0deg ${(p / 100) * 360}deg, #e9d5ff ${(p / 100) * 360}deg 360deg)`;
  }

  dayBadgeClass(status: string): string {
    switch (status) {
      case 'PRESENT':
        return 'ok';
      case 'ABSENT':
        return 'bad';
      case 'ON_LEAVE':
        return 'leave';
      default:
        return 'muted';
    }
  }

  dayBadgeText(status: string): string {
    switch (status) {
      case 'PRESENT':
        return 'PRESENT';
      case 'ABSENT':
        return 'ABSENT';
      case 'ON_LEAVE':
        return 'ON LEAVE';
      default:
        return 'NOT MARKED';
    }
  }

  feeStatusLabel(status: string): string {
    switch (status) {
      case 'paid':
        return 'PAID';
      case 'partially_paid':
        return 'PARTIALLY PAID';
      case 'unpaid':
        return 'UNPAID';
      default:
        return '';
    }
  }

  feeStatusClass(status: string): string {
    switch (status) {
      case 'paid':
        return 'paid';
      case 'partially_paid':
        return 'partial';
      case 'unpaid':
        return 'unpaid';
      default:
        return 'none';
    }
  }

  initials(r: StudentReport): string {
    const parts = r.profile.full_name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  formatDob(iso: string): string {
    const s = (iso || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
    const d = new Date(s + 'T12:00:00');
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  formatPromotionDateTime(iso: string): string {
    const s = (iso || '').trim();
    if (!s) return '—';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  todayLabel(): string {
    return new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  testTotals(r: StudentReport): { tests: number; obtained: number; total: number; percent: number } {
    const tests = r.class_tests.reduce((a, x) => a + (x.total_tests || 0), 0);
    const obtained = r.class_tests.reduce((a, x) => a + (x.obtained_marks || 0), 0);
    const total = r.class_tests.reduce((a, x) => a + (x.total_marks || 0), 0);
    const percent = total > 0 ? (obtained / total) * 100 : 0;
    return { tests, obtained, total, percent: Number(percent.toFixed(1)) };
  }

  gradeFromPercent(percent: number): string {
    const p = Math.max(0, Math.min(100, percent));
    if (p >= 90) return 'A+';
    if (p >= 80) return 'A';
    if (p >= 70) return 'B+';
    if (p >= 60) return 'B';
    if (p >= 50) return 'C';
    if (p >= 40) return 'D';
    return 'F';
  }

  statusFromPercent(percent: number): string {
    return percent >= 33 ? 'PASS' : 'FAIL';
  }

  overallScorePercent(r: StudentReport): number {
    const testPct = this.testTotals(r).percent;
    const attPct = r.attendance.overall_percent || 0;
    const score = attPct * 0.4 + testPct * 0.6;
    return Number(score.toFixed(1));
  }

  starText(percent: number): string {
    const stars = Math.round(Math.max(0, Math.min(100, percent)) / 20);
    return '*****'.slice(0, stars) + '-----'.slice(0, 5 - stars);
  }
}
