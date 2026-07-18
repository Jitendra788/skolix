import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TT_CLASSROOMS_KEY } from '../core/timetable-local.util';
import { TimetableFlowNavComponent } from './timetable-flow-nav.component';

interface ClassRoomRow {
  id: number;
  name: string;
  capacity: string;
}

function defaultRooms(): ClassRoomRow[] {
  return [
    { id: Date.now(), name: 'Room 101', capacity: '40' },
    { id: Date.now() + 1, name: 'Room 102', capacity: '35' },
  ];
}

@Component({
  selector: 'app-timetable-class-rooms',
  standalone: true,
  imports: [CommonModule, FormsModule, TimetableFlowNavComponent],
  template: `
    <section class="cr-page">
      <header class="cr-head">
        <h1>Timetable - Class Rooms</h1>
        <p>Rooms appear as suggestions when you fill the <strong>Room</strong> column on Create Timetable (e.g. Lab-1, Room 204).</p>
      </header>

      <section class="cr-card">
        <app-timetable-flow-nav />
        <div class="cr-form">
          <input
            type="text"
            placeholder="Room name / number"
            [ngModel]="draftName()"
            (ngModelChange)="draftName.set($event)"
          />
          <input
            type="text"
            inputmode="numeric"
            placeholder="Capacity (optional)"
            [ngModel]="draftCap()"
            (ngModelChange)="draftCap.set($event)"
          />
          <button type="button" (click)="add()">Add room</button>
        </div>

        <div class="cr-table-wrap">
          <table class="cr-table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Capacity</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr>
                  <td>{{ r.name }}</td>
                  <td>{{ r.capacity || '—' }}</td>
                  <td><button type="button" class="cr-del" (click)="remove(r.id)">Delete</button></td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="3" class="cr-empty">No rooms added yet.</td>
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
      .cr-page {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .cr-head {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 0.85rem 1rem;
      }
      .cr-head h1 {
        margin: 0;
        font-size: 1.05rem;
      }
      .cr-head p {
        margin: 0.25rem 0 0;
        color: var(--muted);
        font-size: 0.86rem;
      }
      .cr-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 1rem;
      }
      .cr-form {
        display: grid;
        grid-template-columns: 1fr 160px auto;
        gap: 0.55rem;
        margin-bottom: 0.85rem;
      }
      .cr-form input {
        min-height: 40px;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 0.5rem 0.65rem;
        font: inherit;
      }
      .cr-form button {
        border: none;
        border-radius: 999px;
        min-height: 40px;
        padding: 0.5rem 1rem;
        background: linear-gradient(135deg, #059669, #10b981);
        color: #fff;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .cr-table-wrap {
        overflow: auto;
        border: 1px solid var(--border);
        border-radius: 10px;
      }
      .cr-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 400px;
      }
      .cr-table th,
      .cr-table td {
        border-bottom: 1px solid var(--border);
        padding: 0.55rem 0.65rem;
        text-align: left;
      }
      .cr-table thead th {
        background: var(--bg-subtle);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .cr-empty {
        color: var(--muted);
        text-align: center;
      }
      .cr-del {
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
      @media (max-width: 720px) {
        .cr-form {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class TimetableClassRoomsComponent {
  readonly rows = signal<ClassRoomRow[]>(this.read());
  readonly draftName = signal('');
  readonly draftCap = signal('');

  add(): void {
    const name = this.draftName().trim();
    if (!name) return;
    const capacity = this.draftCap().trim();
    const row: ClassRoomRow = { id: Date.now(), name, capacity };
    const next = [...this.rows(), row];
    this.rows.set(next);
    this.persist(next);
    this.draftName.set('');
    this.draftCap.set('');
  }

  remove(id: number): void {
    const next = this.rows().filter((r) => r.id !== id);
    this.rows.set(next);
    this.persist(next);
  }

  private persist(list: ClassRoomRow[]): void {
    localStorage.setItem(TT_CLASSROOMS_KEY, JSON.stringify(list));
  }

  private read(): ClassRoomRow[] {
    try {
      const raw = localStorage.getItem(TT_CLASSROOMS_KEY);
      if (!raw) {
        const seeded = defaultRooms();
        this.persist(seeded);
        return seeded;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        const seeded = defaultRooms();
        this.persist(seeded);
        return seeded;
      }
      return parsed as ClassRoomRow[];
    } catch {
      const seeded = defaultRooms();
      this.persist(seeded);
      return seeded;
    }
  }
}
