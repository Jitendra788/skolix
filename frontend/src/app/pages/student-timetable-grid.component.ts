import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  TtCell,
  TtPeriodRow,
  TtWeekdayRow,
  ttCellKey,
  ttPeriodKind,
} from '../core/timetable-local.util';

@Component({
  selector: 'app-student-timetable-grid',
  standalone: true,
  imports: [CommonModule],
  host: {
    '[class.stg-light]': 'lightTheme',
  },
  template: `
    @if (!hasDays() || !hasPeriods()) {
      <p class="stg-muted">
        Timetable periods or weekdays are not set in this browser yet. Your school admin can configure them under
        <strong>Timetable</strong> in the admin panel.
      </p>
    } @else if (noClassMatch) {
      <p class="stg-muted">
        Your class name could not be matched to the school class list, so the weekly grid cannot be loaded.
      </p>
    } @else if (!hasAnySlot()) {
      <p class="stg-muted">
        No timetable slots are saved for <strong>{{ classLabel }}</strong> yet. When your school adds the class
        timetable, it will appear here on this device.
      </p>
    } @else {
      <div class="stg-scroll">
        <table class="stg-grid">
          <thead>
            <tr>
              <th class="stg-corner" [style.width.%]="periodColumnPercent()">Period / time</th>
              @for (d of days; track d.id) {
                <th [style.width.%]="dayColumnPercent()">{{ d.label }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (p of periods; track p.id) {
              @if (ttPeriodKind(p) !== 'teaching') {
                <tr class="stg-row-non-teach" [class.stg-row-assembly]="ttPeriodKind(p) === 'assembly'">
                  <th class="stg-period" [style.width.%]="periodColumnPercent()">
                    {{ p.name }}
                    <span class="stg-time">{{ p.start }} – {{ p.end }}</span>
                  </th>
                  <td class="stg-break-cell" [attr.colspan]="days.length">{{ p.name }}</td>
                </tr>
              } @else {
                <tr>
                  <th class="stg-period" [style.width.%]="periodColumnPercent()">
                    {{ p.name }}
                    <span class="stg-time">{{ p.start }} – {{ p.end }}</span>
                  </th>
                  @for (d of days; track d.id) {
                    <td
                      class="stg-cell"
                      [class.stg-cell-filled]="slotFilled(d.id, p.id)"
                      [style.width.%]="dayColumnPercent()"
                    >
                      @if (cell(d.id, p.id); as slot) {
                        @if (slot.subject || slot.teacher || slot.room) {
                          <div class="stg-subj">{{ slot.subject || '—' }}</div>
                          <div class="stg-teach">{{ slot.teacher || '—' }}</div>
                          @if (slot.room) {
                            <div class="stg-room">Room: {{ slot.room }}</div>
                          }
                        } @else {
                          <span class="stg-free">—</span>
                        }
                      }
                    </td>
                  }
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [
    `
      .stg-muted {
        margin: 0;
        font-size: 0.88rem;
        color: #94a3b8;
        line-height: 1.45;
        max-width: 56ch;
      }
      .stg-scroll {
        overflow: auto;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 12px;
        background: rgba(2, 6, 23, 0.35);
      }
      .stg-grid {
        width: 100%;
        border-collapse: collapse;
        min-width: 640px;
      }
      .stg-grid th,
      .stg-grid td {
        border: 1px solid rgba(148, 163, 184, 0.18);
        padding: 0.5rem 0.55rem;
        vertical-align: top;
      }
      .stg-corner,
      .stg-period {
        text-align: left;
        background: rgba(15, 23, 42, 0.75);
        color: #e2e8f0;
        font-weight: 700;
        font-size: 0.8rem;
      }
      .stg-period {
        white-space: nowrap;
      }
      .stg-grid thead th {
        background: rgba(14, 165, 233, 0.12);
        color: #bae6fd;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        text-align: center;
      }
      .stg-time {
        display: block;
        margin-top: 0.15rem;
        font-weight: 600;
        color: #94a3b8;
        font-size: 0.72rem;
      }
      .stg-cell {
        background: rgba(15, 23, 42, 0.25);
        color: #cbd5e1;
        font-size: 0.82rem;
        min-width: 6.5rem;
        text-align: center;
      }
      .stg-cell-filled {
        background: rgba(14, 165, 233, 0.08);
      }
      .stg-subj {
        font-weight: 700;
        color: #f8fafc;
        font-size: 0.84rem;
      }
      .stg-teach {
        margin-top: 0.2rem;
        font-size: 0.76rem;
        color: #94a3b8;
      }
      .stg-room {
        margin-top: 0.15rem;
        font-size: 0.72rem;
        color: #7dd3fc;
      }
      .stg-free {
        color: #64748b;
      }
      .stg-row-non-teach .stg-period {
        background: rgba(30, 41, 59, 0.85);
      }
      .stg-row-non-teach .stg-break-cell {
        text-align: center;
        font-weight: 700;
        color: #cbd5e1;
        background: rgba(30, 41, 59, 0.45);
      }
      .stg-row-assembly .stg-break-cell {
        background: rgba(234, 179, 8, 0.1);
        color: #fde68a;
      }

      :host.stg-light .stg-muted {
        color: #64748b;
      }
      :host.stg-light .stg-scroll {
        background: linear-gradient(180deg, #ffffff 0%, #fafbfc 100%);
        border-color: rgba(226, 232, 240, 0.95);
        box-shadow:
          0 1px 2px rgba(15, 23, 42, 0.04),
          0 10px 32px rgba(15, 23, 42, 0.08);
      }
      :host.stg-light .stg-corner,
      :host.stg-light .stg-period {
        background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
        color: #0f172a;
        border-color: #e2e8f0;
      }
      :host.stg-light .stg-grid thead th {
        background: linear-gradient(180deg, #fff7ed 0%, #ffedd5 100%);
        color: #c2410c;
      }
      :host.stg-light .stg-time {
        color: #64748b;
      }
      :host.stg-light .stg-cell {
        background: #fff;
        color: #334155;
        border-color: #e2e8f0;
      }
      :host.stg-light .stg-cell-filled {
        background: linear-gradient(145deg, #fffbeb 0%, #fef3c7 100%);
      }
      :host.stg-light .stg-subj {
        color: #0f172a;
      }
      :host.stg-light .stg-teach {
        color: #64748b;
      }
      :host.stg-light .stg-room {
        color: #ea580c;
      }
      :host.stg-light .stg-row-non-teach .stg-period {
        background: #f1f5f9;
      }
      :host.stg-light .stg-row-non-teach .stg-break-cell {
        background: #f8fafc;
        color: #475569;
      }
      :host.stg-light .stg-row-assembly .stg-break-cell {
        background: #fffbeb;
        color: #b45309;
      }
    `,
  ],
})
export class StudentTimetableGridComponent {
  @Input({ required: true }) days!: TtWeekdayRow[];
  @Input({ required: true }) periods!: TtPeriodRow[];
  @Input({ required: true }) cells!: Record<string, TtCell>;
  @Input({ required: true }) classLabel!: string;
  @Input() noClassMatch = false;
  @Input() lightTheme = false;

  readonly ttPeriodKind = ttPeriodKind;

  hasDays(): boolean {
    return (this.days?.length ?? 0) > 0;
  }

  hasPeriods(): boolean {
    return (this.periods?.length ?? 0) > 0;
  }

  hasAnySlot(): boolean {
    return Object.values(this.cells ?? {}).some(
      (c) => `${c.subject || ''}${c.teacher || ''}${c.room || ''}`.trim().length > 0
    );
  }

  cell(dayId: number, periodId: number): TtCell {
    const k = ttCellKey(dayId, periodId);
    return this.cells[k] ?? { subject: '', teacher: '', room: '' };
  }

  slotFilled(dayId: number, periodId: number): boolean {
    const s = this.cell(dayId, periodId);
    return !!(s.subject?.trim() || s.teacher?.trim() || s.room?.trim());
  }

  periodColumnPercent(): number {
    return 14;
  }

  dayColumnPercent(): number {
    const d = this.days?.length || 1;
    return (100 - this.periodColumnPercent()) / d;
  }
}
