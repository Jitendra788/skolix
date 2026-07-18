import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  TT_PERIODS_KEY,
  TtPeriodKind,
  TtPeriodRow,
  ttPeriodKind,
} from '../core/timetable-local.util';
import { TimetableFlowNavComponent } from './timetable-flow-nav.component';

@Component({
  selector: 'app-timetable-time-periods',
  standalone: true,
  imports: [CommonModule, FormsModule, TimetableFlowNavComponent],
  template: `
    <section class="tp-page">
      <header class="tp-head">
        <h1>Timetable - Time Periods</h1>
        <p>
          Add <strong>Teaching</strong> periods (subject / teacher), plus <strong>Break</strong> (recess, lunch) and
          <strong>Assembly</strong> rows — like a printed school timetable.
        </p>
      </header>

      <section class="tp-card">
        <app-timetable-flow-nav />
        <div class="tp-form">
          <input type="text" placeholder="Name (e.g. Period 1, Recess)" [ngModel]="draftName()" (ngModelChange)="draftName.set($event)" />
          <select
            class="tp-kind"
            [ngModel]="draftKind()"
            (ngModelChange)="draftKind.set($event)"
          >
            <option value="teaching">Teaching</option>
            <option value="break">Break / Recess</option>
            <option value="assembly">Assembly</option>
          </select>
          <input type="time" [ngModel]="draftStart()" (ngModelChange)="draftStart.set($event)" />
          <input type="time" [ngModel]="draftEnd()" (ngModelChange)="draftEnd.set($event)" />
          <button type="button" (click)="add()">Add</button>
        </div>

        <div class="tp-table-wrap">
          <table class="tp-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Period</th>
                <th>Start</th>
                <th>End</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr [class.tp-row-break]="ttPeriodKind(r) === 'break'" [class.tp-row-assembly]="ttPeriodKind(r) === 'assembly'">
                  <td><span class="tp-badge" [class]="'tp-b-' + (r.kind || 'teaching')">{{ kindLabel(r) }}</span></td>
                  <td>{{ r.name }}</td>
                  <td>{{ r.start }}</td>
                  <td>{{ r.end }}</td>
                  <td><button type="button" class="tp-del" (click)="remove(r.id)">Delete</button></td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="tp-empty">No time periods added.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </section>
  `,
  styles: [
    `
      .tp-page {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .tp-head {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 0.85rem 1rem;
      }
      .tp-head h1 {
        margin: 0;
        font-size: 1.05rem;
      }
      .tp-head p {
        margin: 0.25rem 0 0;
        color: var(--muted);
        font-size: 0.86rem;
      }
      .tp-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 1rem;
      }
      .tp-form {
        display: grid;
        grid-template-columns: 1fr 140px 150px 150px auto;
        gap: 0.55rem;
        margin-bottom: 0.85rem;
        align-items: center;
      }
      .tp-form input,
      .tp-kind {
        min-height: 40px;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 0.5rem 0.65rem;
        font: inherit;
      }
      .tp-form button {
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
      .tp-table-wrap {
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: 10px;
      }
      .tp-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 560px;
      }
      .tp-table th,
      .tp-table td {
        border-bottom: 1px solid var(--border);
        padding: 0.55rem 0.65rem;
        text-align: left;
      }
      .tp-table thead th {
        background: var(--bg-subtle);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .tp-row-break {
        background: #f8fafc;
      }
      .tp-row-assembly {
        background: #fefce8;
      }
      .tp-badge {
        display: inline-block;
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 0.2rem 0.5rem;
        border-radius: 999px;
        background: #e0e7ff;
        color: #3730a3;
      }
      .tp-b-break {
        background: #e2e8f0;
        color: #334155;
      }
      .tp-b-assembly {
        background: #fef08a;
        color: #713f12;
      }
      .tp-b-teaching {
        background: #dbeafe;
        color: #1e3a8a;
      }
      .tp-empty {
        color: var(--muted);
        text-align: center;
      }
      .tp-del {
        border: 1px solid #fecaca;
        background: #fff1f2;
        color: #b91c1c;
        border-radius: 999px;
        min-height: 30px;
        padding: 0.2rem 0.7rem;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      @media (max-width: 900px) {
        .tp-form {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class TimetableTimePeriodsComponent {
  private readonly storageKey = TT_PERIODS_KEY;
  readonly rows = signal<TtPeriodRow[]>(this.read());
  readonly draftName = signal('');
  readonly draftStart = signal('');
  readonly draftEnd = signal('');
  readonly draftKind = signal<TtPeriodKind>('teaching');

  readonly ttPeriodKind = ttPeriodKind;

  kindLabel(r: TtPeriodRow): string {
    switch (ttPeriodKind(r)) {
      case 'break':
        return 'Break';
      case 'assembly':
        return 'Assembly';
      default:
        return 'Teaching';
    }
  }

  add(): void {
    const name = this.draftName().trim();
    const start = this.draftStart().trim();
    const end = this.draftEnd().trim();
    if (!name || !start || !end) return;
    const kind = this.draftKind();
    const row: TtPeriodRow = { id: Date.now(), name, start, end, kind };
    const next = [...this.rows(), row];
    this.rows.set(next);
    this.persist(next);
    this.draftName.set('');
    this.draftStart.set('');
    this.draftEnd.set('');
    this.draftKind.set('teaching');
  }

  remove(id: number): void {
    const next = this.rows().filter((r) => r.id !== id);
    this.rows.set(next);
    this.persist(next);
  }

  private persist(rows: TtPeriodRow[]): void {
    localStorage.setItem(this.storageKey, JSON.stringify(rows));
  }

  private read(): TtPeriodRow[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed as TtPeriodRow[];
    } catch {
      return [];
    }
  }
}
