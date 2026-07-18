import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TimetableFlowNavComponent } from './timetable-flow-nav.component';

interface WeekdayRow {
  id: number;
  label: string;
  active: boolean;
}

@Component({
  selector: 'app-timetable-weekdays',
  standalone: true,
  imports: [CommonModule, FormsModule, TimetableFlowNavComponent],
  template: `
    <section class="tt-page">
      <header class="tt-head">
        <h1>Timetable - Weekdays</h1>
        <p>Choose working days (Mon–Fri typical). Enable Saturday if your school runs a sixth day.</p>
      </header>

      <section class="tt-card">
        <app-timetable-flow-nav />
        <div class="tt-list">
          @for (d of rows(); track d.id) {
            <label class="tt-row">
              <input type="checkbox" [ngModel]="d.active" (ngModelChange)="toggle(d.id, $event)" />
              <span>{{ d.label }}</span>
            </label>
          }
        </div>
        <div class="tt-actions">
          <button type="button" (click)="save()">Save Weekdays</button>
        </div>
        @if (message()) {
          <p class="tt-msg">{{ message() }}</p>
        }
      </section>
    </section>
  `,
  styles: [`
    .tt-page { display: flex; flex-direction: column; gap: 1rem; }
    .tt-head { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 0.85rem 1rem; }
    .tt-head h1 { margin: 0; font-size: 1.05rem; }
    .tt-head p { margin: 0.25rem 0 0; color: var(--muted); font-size: 0.86rem; }
    .tt-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; }
    .tt-list { display: grid; grid-template-columns: repeat(2, minmax(180px, 1fr)); gap: 0.6rem; }
    .tt-row { display: flex; align-items: center; gap: 0.55rem; min-height: 40px; border: 1px solid var(--border); border-radius: 10px; padding: 0.45rem 0.7rem; }
    .tt-actions { margin-top: 0.8rem; display: flex; justify-content: flex-end; }
    button { border: none; border-radius: 999px; min-height: 38px; padding: 0.5rem 1rem; background: linear-gradient(135deg, #f59e0b, #fbbf24); color: #111827; font: inherit; font-weight: 700; cursor: pointer; }
    .tt-msg { margin: 0.7rem 0 0; color: #0f766e; font-weight: 600; }
    @media (max-width: 760px) { .tt-list { grid-template-columns: 1fr; } }
  `],
})
export class TimetableWeekdaysComponent {
  private readonly storageKey = 'tt-weekdays-v1';
  private readonly defaults: WeekdayRow[] = [
    { id: 1, label: 'Monday', active: true },
    { id: 2, label: 'Tuesday', active: true },
    { id: 3, label: 'Wednesday', active: true },
    { id: 4, label: 'Thursday', active: true },
    { id: 5, label: 'Friday', active: true },
    { id: 6, label: 'Saturday', active: false },
    { id: 7, label: 'Sunday', active: false },
  ];

  readonly rows = signal<WeekdayRow[]>(this.read());
  readonly message = signal('');

  toggle(id: number, active: boolean): void {
    this.rows.update((list) => {
      const next = list.map((x) => (x.id === id ? { ...x, active } : x));
      localStorage.setItem(this.storageKey, JSON.stringify(next));
      return next;
    });
    this.message.set('Saved.');
  }

  save(): void {
    localStorage.setItem(this.storageKey, JSON.stringify(this.rows()));
    this.message.set('Weekdays saved.');
  }

  private read(): WeekdayRow[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return this.defaults;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : this.defaults;
    } catch {
      return this.defaults;
    }
  }
}
