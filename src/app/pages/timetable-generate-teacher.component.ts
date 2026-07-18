import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TimetableFlowNavComponent } from './timetable-flow-nav.component';
import { ApiService } from '../core/api.service';
import { SchoolRefService } from '../core/school-ref.service';
import {
  loadActiveWeekdays,
  loadFullGrid,
  loadPeriods,
  ttParseGridStorageKey,
  ttPeriodKind,
} from '../core/timetable-local.util';

interface TeacherSlotRow {
  dayId: number;
  periodId: number;
  day: string;
  period: string;
  className: string;
  subject: string;
  room: string;
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Exact or substring match (min 3 chars) so timetable vs faculty spelling variants still match. */
function teacherMatches(cellTeacher: string, selected: string): boolean {
  const a = norm(cellTeacher);
  const b = norm(selected);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.length >= 3 && a.includes(b)) return true;
  if (a.length >= 3 && b.includes(a)) return true;
  return false;
}

@Component({
  selector: 'app-timetable-generate-teacher',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TimetableFlowNavComponent],
  template: `
    <section class="tt-page">
      <header class="tt-head">
        <h1>Timetable - Generate for teacher</h1>
        <p>Weekly teaching load: periods where this teacher appears (with class / section and room).</p>
      </header>

      <section class="tt-card">
        <app-timetable-flow-nav />
        <div class="tt-row">
          <label class="tt-field">
            <span>Teacher</span>
            <select [ngModel]="teacher()" (ngModelChange)="onTeacherChange($event)">
              <option value="">Select teacher</option>
              @for (t of teacherChoices(); track t) {
                <option [value]="t">{{ t }}</option>
              }
            </select>
          </label>
          <button type="button" class="tt-btn" [disabled]="!teacher()" (click)="rebuild()">Refresh</button>
        </div>

        @if (!teacher()) {
          <p class="tt-hint">Choose a teacher to load their weekly slots.</p>
        } @else if (rows().length === 0) {
          <p class="tt-empty">
            No periods found — spelling must match the teacher name in
            <a routerLink="/timetable/create">Create Timetable</a>. Try another teacher or Refresh.
          </p>
        } @else {
          <div class="tt-table-wrap">
            <table class="tt-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Period</th>
                  <th>Class</th>
                  <th>Subject</th>
                  <th>Room</th>
                </tr>
              </thead>
              <tbody>
                @for (r of rows(); track trackRow(r)) {
                  <tr>
                    <td>{{ r.day }}</td>
                    <td>{{ r.period }}</td>
                    <td>{{ r.className }}</td>
                    <td>{{ r.subject || '—' }}</td>
                    <td>{{ r.room || '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </section>
  `,
  styles: [
    `
      .tt-page {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .tt-head {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 0.85rem 1rem;
      }
      .tt-head h1 {
        margin: 0;
        font-size: 1.05rem;
      }
      .tt-head p {
        margin: 0.25rem 0 0;
        color: var(--muted);
        font-size: 0.86rem;
      }
      .tt-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 1rem;
      }
      .tt-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
        margin-bottom: 0.75rem;
      }
      .tt-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 240px;
      }
      .tt-field span {
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .tt-field select {
        min-height: 40px;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 0.45rem 0.6rem;
        font: inherit;
      }
      .tt-btn {
        border: none;
        border-radius: 999px;
        min-height: 40px;
        padding: 0.5rem 1rem;
        background: linear-gradient(135deg, #2563eb, #3b82f6);
        color: #fff;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .tt-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .tt-hint,
      .tt-empty {
        margin: 0.25rem 0 0;
        color: var(--muted);
        font-size: 0.9rem;
      }
      .tt-empty {
        padding: 0.65rem 0.75rem;
        border-radius: 10px;
        background: #f8fafc;
        border: 1px solid var(--border);
      }
      .tt-empty a {
        color: var(--accent);
        font-weight: 700;
      }
      .tt-table-wrap {
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: 10px;
      }
      .tt-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 520px;
      }
      .tt-table th,
      .tt-table td {
        border-bottom: 1px solid var(--border);
        padding: 0.55rem 0.65rem;
        text-align: left;
        font-size: 0.88rem;
      }
      .tt-table thead th {
        background: var(--bg-subtle);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
    `,
  ],
})
export class TimetableGenerateTeacherComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly schoolRef = inject(SchoolRefService);

  readonly teacher = signal('');
  readonly rows = signal<TeacherSlotRow[]>([]);
  readonly teacherChoices = signal<string[]>([]);
  private readonly fromFaculty = signal<string[]>([]);

  readonly classIdToName = computed(() => {
    const m = new Map<string, string>();
    for (const c of this.schoolRef.classes()) {
      m.set(String(c.id), c.name);
    }
    return m;
  });

  ngOnInit(): void {
    this.api.listFaculty().subscribe({
      next: (list) => {
        const names = [...new Set(list.map((f) => (f.name || '').trim()).filter(Boolean))].sort((a, b) =>
          a.localeCompare(b)
        );
        this.fromFaculty.set(names);
        this.refreshTeacherChoices();
      },
      error: () => {
        this.fromFaculty.set([]);
        this.refreshTeacherChoices();
      },
    });
  }

  trackRow(r: TeacherSlotRow): string {
    return `${r.dayId}-${r.periodId}-${r.className}-${r.subject}-${r.room}`;
  }

  onTeacherChange(name: string): void {
    this.teacher.set(name);
    this.rebuild();
  }

  rebuild(): void {
    const selected = (this.teacher() || '').trim();
    if (!selected) {
      this.rows.set([]);
      return;
    }

    const days = loadActiveWeekdays();
    const periods = loadPeriods();
    const dayLabel = (id: number): string => days.find((d) => d.id === id)?.label ?? `Day ${id}`;
    const periodLabel = (id: number): string => {
      const pr = periods.find((p) => p.id === id);
      if (!pr) return `Period ${id}`;
      const tag = ttPeriodKind(pr) === 'teaching' ? '' : ttPeriodKind(pr) === 'assembly' ? ' · Assembly' : ' · Break';
      return `${pr.name} (${pr.start}–${pr.end})${tag}`;
    };

    const grid = loadFullGrid();
    const out: TeacherSlotRow[] = [];

    for (const storageKey of Object.keys(grid)) {
      const cells = grid[storageKey];
      const { classId: cid, section } = ttParseGridStorageKey(storageKey);
      const baseName = this.classIdToName().get(cid) ?? `Class #${cid}`;
      const classLabel = section ? `${baseName} — Sec ${section}` : baseName;
      for (const key of Object.keys(cells)) {
        const cell = cells[key];
        if (!teacherMatches(cell.teacher || '', selected)) continue;
        const parts = key.split('-');
        const dayId = Number(parts[0]);
        const periodId = Number(parts[1]);
        if (Number.isNaN(dayId) || Number.isNaN(periodId)) continue;
        const pr = periods.find((p) => p.id === periodId);
        if (pr && ttPeriodKind(pr) !== 'teaching') continue;
        out.push({
          dayId,
          periodId,
          day: dayLabel(dayId),
          period: periodLabel(periodId),
          className: classLabel,
          subject: cell.subject || '',
          room: (cell.room || '').trim(),
        });
      }
    }

    out.sort((a, b) => {
      if (a.dayId !== b.dayId) return a.dayId - b.dayId;
      if (a.periodId !== b.periodId) return a.periodId - b.periodId;
      return a.className.localeCompare(b.className);
    });
    this.rows.set(out);
  }

  private refreshTeacherChoices(): void {
    const fromGrid = new Set<string>();
    const grid = loadFullGrid();
    for (const cells of Object.values(grid)) {
      for (const c of Object.values(cells)) {
        const t = (c.teacher || '').trim();
        if (t) fromGrid.add(t);
      }
    }
    const merged = [...new Set([...this.fromFaculty(), ...fromGrid])].sort((a, b) => a.localeCompare(b));
    this.teacherChoices.set(merged);
  }
}
