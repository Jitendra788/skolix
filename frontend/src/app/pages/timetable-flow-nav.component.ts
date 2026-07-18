import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** Horizontal step links — reuse on all timetable screens. */
@Component({
  selector: 'app-timetable-flow-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="flow" aria-label="Timetable setup steps">
      <a
        routerLink="/timetable/weekdays"
        routerLinkActive="here"
        [routerLinkActiveOptions]="{ exact: true }"
        >1. Weekdays</a>
      <a
        routerLink="/timetable/time-periods"
        routerLinkActive="here"
        [routerLinkActiveOptions]="{ exact: true }"
        >2. Periods</a>
      <a
        routerLink="/timetable/class-rooms"
        routerLinkActive="here"
        [routerLinkActiveOptions]="{ exact: true }"
        >3. Rooms</a>
      <a
        routerLink="/timetable/create"
        routerLinkActive="here"
        [routerLinkActiveOptions]="{ exact: true }"
        >4. Create</a>
      <a
        routerLink="/timetable/generate-class"
        routerLinkActive="here"
        [routerLinkActiveOptions]="{ exact: true }"
        >5. Class View</a>
      <a
        routerLink="/timetable/generate-teacher"
        routerLinkActive="here"
        [routerLinkActiveOptions]="{ exact: true }"
        >6. Teacher View</a>
    </nav>
  `,
  styles: [
    `
      .flow {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-bottom: 0.85rem;
        padding: 0.5rem 0.65rem;
        background: linear-gradient(180deg, var(--bg-muted) 0%, var(--surface) 100%);
        border: 1px solid var(--border);
        border-radius: 10px;
        font-size: 0.78rem;
        box-shadow: var(--shadow-sm);
      }
      .flow a {
        color: var(--text-secondary);
        text-decoration: none;
        padding: 0.32rem 0.65rem;
        border-radius: 999px;
        font-weight: 600;
        border: 1px solid transparent;
        transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      }
      .flow a:hover {
        background: var(--surface);
        color: var(--accent);
        border-color: var(--border);
      }
      .flow a.here {
        background: var(--accent-soft);
        color: var(--accent);
        border-color: rgba(79, 70, 229, 0.25);
      }
    `,
  ],
})
export class TimetableFlowNavComponent {}
