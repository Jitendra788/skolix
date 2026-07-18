import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { SchoolRefService } from '../core/school-ref.service';
import { TimetableFlowNavComponent } from './timetable-flow-nav.component';
import {
  TtCell,
  loadActiveWeekdays,
  loadClassGrid,
  loadPeriods,
  ttCellKey,
  ttGridStorageKey,
  ttPeriodKind,
} from '../core/timetable-local.util';

@Component({
  selector: 'app-timetable-generate-class',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TimetableFlowNavComponent],
  template: `
    <section class="tg-page">
      <header class="tg-head tg-no-print">
        <h1>Timetable - Generate for class</h1>
        <p>Read-only grid — same layout as Create. Print hides controls and keeps the school title.</p>
      </header>

      <section class="tg-card">
        <app-timetable-flow-nav />
        <div class="tg-toolbar tg-no-print">
          <label class="tg-field">
            <span>Class</span>
            <select [ngModel]="classId()" (ngModelChange)="onClassChange($event)">
              <option value="">Select class</option>
              @for (c of classOptions(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>
          </label>
          @if (sectionChoices().length > 0) {
            <label class="tg-field">
              <span>Section</span>
              <select [ngModel]="sectionCode()" (ngModelChange)="onSectionChange($event)">
                <option value="">All Sections</option>
                @for (sec of sectionChoices(); track sec) {
                  <option [value]="sec">Section {{ sec }}</option>
                }
              </select>
            </label>
          }
          <button type="button" class="tg-print" [disabled]="!classId()" (click)="print()">Print</button>
        </div>

        @if (!hasDays() || !hasPeriods()) {
          <p class="tg-warn tg-no-print">Configure weekdays and time periods first.</p>
        }

        @if (classId() && hasDays() && hasPeriods()) {
          <div class="tg-banner tg-no-print">
            @if (schoolName()) {
              <div class="tg-banner-school">{{ schoolName() }}</div>
            }
            <div class="tg-banner-sub">Weekly timetable · {{ classDisplayLabel() }}</div>
          </div>
          @if (!hasAnySlot()) {
            <p class="tg-empty tg-no-print">
              No slots filled for this class yet.
              <a routerLink="/timetable/create">Open Create Timetable</a>
              to add subjects and teachers.
            </p>
          }
          <div class="tg-print-head">
            @if (schoolName()) {
              <div class="tg-school">{{ schoolName() }}</div>
            }
            <div class="tg-print-title">Class timetable — {{ classDisplayLabel() }}</div>
          </div>
          <div class="tg-scroll">
            <table class="tg-grid">
              <thead>
                <tr>
                  <th class="tg-corner" [style.width.%]="periodColumnPercent()">Period / time</th>
                  @for (d of days(); track d.id) {
                    <th [style.width.%]="dayColumnPercent()">{{ d.label }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (p of periods(); track p.id) {
                  @if (ttPeriodKind(p) !== 'teaching') {
                    <tr
                      class="tg-row-non-teach"
                      [class.tg-row-assembly]="ttPeriodKind(p) === 'assembly'"
                    >
                      <th class="tg-period" [style.width.%]="periodColumnPercent()">
                        {{ p.name }}
                        <span class="tg-time">{{ p.start }} – {{ p.end }}</span>
                      </th>
                      <td class="tg-break-cell" [attr.colspan]="days().length">{{ p.name }}</td>
                    </tr>
                  } @else {
                    <tr>
                      <th class="tg-period" [style.width.%]="periodColumnPercent()">
                        {{ p.name }}
                        <span class="tg-time">{{ p.start }} – {{ p.end }}</span>
                      </th>
                      @for (d of days(); track d.id) {
                        <td
                          class="tg-cell"
                          [class.tg-cell-filled]="slotFilled(d.id, p.id)"
                          [style.width.%]="dayColumnPercent()"
                        >
                          @if (cell(d.id, p.id); as slot) {
                            @if (slot.subject || slot.teacher || slot.room) {
                              <div class="tg-subj">{{ slot.subject || '—' }}</div>
                              <div class="tg-teach">{{ slot.teacher || '—' }}</div>
                              @if (slot.room) {
                                <div class="tg-room">Room: {{ slot.room }}</div>
                              }
                            } @else {
                              <span class="tg-free">Free</span>
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
        } @else if (!classId()) {
          <p class="tg-hint tg-no-print">Select a class to preview.</p>
        }
      </section>
    </section>
  `,
  styles: [
    `
      .tg-page {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .tg-head {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 0.85rem 1rem;
      }
      .tg-head h1 {
        margin: 0;
        font-size: 1.05rem;
      }
      .tg-head p {
        margin: 0.25rem 0 0;
        color: var(--muted);
        font-size: 0.86rem;
      }
      .tg-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 1rem;
      }
      .tg-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
        margin-bottom: 0.85rem;
      }
      .tg-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 200px;
      }
      .tg-field span {
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .tg-field select {
        min-height: 40px;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 0.45rem 0.6rem;
        font: inherit;
      }
      .tg-print {
        border: none;
        border-radius: 999px;
        min-height: 40px;
        padding: 0.5rem 1.1rem;
        background: linear-gradient(135deg, #0f766e, #14b8a6);
        color: #fff;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .tg-print:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .tg-warn {
        margin: 0 0 0.75rem;
        padding: 0.65rem 0.75rem;
        border-radius: 10px;
        background: #fffbeb;
        border: 1px solid #fde68a;
        color: #92400e;
        font-size: 0.88rem;
      }
      .tg-hint {
        margin: 0.5rem 0 0;
        color: var(--muted);
      }
      .tg-banner {
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 0.75rem;
        padding: 0.65rem 0.85rem;
        background: var(--welcome-banner);
        border: 1px solid var(--border);
        border-radius: 10px;
        text-align: center;
      }
      .tg-banner-school {
        font-weight: 800;
        font-size: 1rem;
        color: var(--text);
      }
      .tg-banner-sub {
        display: block;
        width: 100%;
        font-size: 0.86rem;
        color: var(--muted);
        font-weight: 600;
        margin-top: 0.2rem;
      }
      .tg-empty {
        margin: 0 0 0.75rem;
        padding: 0.65rem 0.85rem;
        border-radius: 10px;
        background: #fffbeb;
        border: 1px solid #fde68a;
        color: #92400e;
        font-size: 0.88rem;
      }
      .tg-empty a {
        color: var(--accent);
        font-weight: 700;
      }
      .tg-print-head {
        display: none;
        text-align: center;
        margin-bottom: 0.75rem;
      }
      .tg-school {
        font-size: 1.1rem;
        font-weight: 800;
      }
      .tg-print-title {
        font-size: 0.95rem;
        font-weight: 600;
        color: #334155;
        margin-top: 0.25rem;
      }
      .tg-scroll {
        overflow: auto;
        max-width: 100%;
        border: 1px solid var(--border);
        border-radius: 10px;
        max-height: min(70vh, 900px);
        position: relative;
      }
      .tg-grid {
        border-collapse: separate;
        border-spacing: 0;
        width: 100% !important;
        min-width: 100%;
        table-layout: fixed;
      }
      .tg-grid th,
      .tg-grid td {
        border: 1px solid var(--border);
        padding: 0.45rem;
        vertical-align: top;
        width: auto;
      }
      .tg-grid thead th {
        background: var(--bg-subtle);
        font-size: 0.78rem;
        text-align: center;
      }
      .tg-corner {
        width: 140px;
        min-width: 140px;
        position: sticky;
        top: 0;
        left: 0;
        z-index: 4;
        background: var(--bg-subtle);
        box-shadow: 2px 2px 0 rgba(15, 23, 42, 0.06);
      }
      .tg-grid thead th:not(.tg-corner) {
        position: sticky;
        top: 0;
        z-index: 1;
        box-shadow: 0 1px 0 var(--border);
      }
      .tg-period {
        text-align: left;
        background: var(--bg-subtle);
        font-size: 0.82rem;
        width: 140px;
        min-width: 140px;
        position: sticky;
        left: 0;
        z-index: 2;
        box-shadow: 4px 0 12px -6px rgba(15, 23, 42, 0.12);
      }
      .tg-time {
        display: block;
        font-weight: 400;
        font-size: 0.72rem;
        color: var(--muted);
      }
      .tg-cell {
        min-width: 0;
        font-size: 0.82rem;
        background: var(--surface);
        word-break: break-word;
      }
      .tg-grid tbody tr:not(.tg-row-non-teach) td:nth-child(even) {
        background: rgba(248, 250, 252, 0.85);
      }
      .tg-cell-filled {
        box-shadow: inset 0 0 0 2px rgba(79, 70, 229, 0.18);
        background: rgba(238, 242, 255, 0.5) !important;
      }
      .tg-subj {
        font-weight: 700;
      }
      .tg-teach {
        color: var(--muted);
        margin-top: 0.15rem;
      }
      .tg-room {
        font-size: 0.76rem;
        color: #475569;
        margin-top: 0.2rem;
      }
      .tg-free {
        color: var(--muted);
        font-style: italic;
      }
      .tg-break-cell {
        text-align: center;
        font-weight: 700;
        background: #f1f5f9;
        vertical-align: middle;
      }
      .tg-row-assembly .tg-break-cell {
        background: #fffbeb;
      }
      @media (max-width: 900px) {
        .tg-grid {
          min-width: 560px;
        }
        .tg-corner {
          min-width: 100px;
        }
        .tg-period {
          min-width: 96px;
          font-size: 0.78rem;
        }
        .tg-cell {
          min-width: 96px;
          font-size: 0.78rem;
        }
      }
      @media (max-width: 640px) {
        .tg-card {
          padding: 0.75rem;
        }
        .tg-grid {
          min-width: 100%;
        }
        .tg-corner,
        .tg-period {
          position: static;
          box-shadow: none;
        }
        .tg-grid thead th:not(.tg-corner) {
          position: static;
          box-shadow: none;
        }
      }
      @media print {
        .tg-no-print {
          display: none !important;
        }
        .tg-print-head {
          display: block !important;
        }
        .tg-card {
          border: none;
          padding: 0;
        }
        .tg-scroll {
          border: none;
        }
        .tg-grid {
          min-width: 0;
          width: 100%;
        }
      }
    `,
  ],
})
export class TimetableGenerateClassComponent implements OnInit {
  private readonly schoolRef = inject(SchoolRefService);
  private readonly api = inject(ApiService);

  readonly classId = signal('');
  readonly sectionCode = signal('');
  readonly cells = signal<Record<string, TtCell>>({});
  readonly days = signal(loadActiveWeekdays());
  readonly periods = signal(loadPeriods());
  readonly schoolName = signal('');

  readonly ttPeriodKind = ttPeriodKind;

  readonly classOptions = computed(() =>
    [...this.schoolRef.classes()].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  );

  readonly sectionChoices = computed(() => {
    const id = this.classId();
    if (!id) return [] as string[];
    const row = this.schoolRef.classes().find((c) => String(c.id) === id);
    const raw = row?.sections ?? [];
    const list = raw.map((s) => String(s).trim()).filter(Boolean);
    return [...new Set(list)].sort((a, b) => a.localeCompare(b));
  });

  readonly classDisplayLabel = computed(() => {
    const id = this.classId();
    if (!id) return '';
    const row = this.schoolRef.classes().find((c) => String(c.id) === id);
    const name = row?.name ?? `Class ${id}`;
    const sec = this.sectionCode().trim();
    if (this.sectionChoices().length > 0 && sec) {
      return `${name} (Sec ${sec})`;
    }
    if (this.sectionChoices().length > 0) {
      return `${name} (All Sections)`;
    }
    return name;
  });

  readonly hasAnySlot = computed(() =>
    Object.values(this.cells()).some(
      (c) => (c.subject || '').trim() || (c.teacher || '').trim() || (c.room || '').trim()
    )
  );

  ngOnInit(): void {
    this.api.getInstituteProfile().subscribe({
      next: (p) => this.schoolName.set((p.name || '').trim()),
      error: () => this.schoolName.set(''),
    });
  }

  hasDays(): boolean {
    return this.days().length > 0;
  }

  hasPeriods(): boolean {
    return this.periods().length > 0;
  }

  onClassChange(id: string | number): void {
    const s = id === '' || id === null || id === undefined ? '' : String(id);
    this.classId.set(s);
    this.sectionCode.set('');
    this.cells.set(s ? loadClassGrid(ttGridStorageKey(s, '')) : {});
    this.days.set(loadActiveWeekdays());
    this.periods.set(loadPeriods());
  }

  onSectionChange(code: string): void {
    this.sectionCode.set(code ?? '');
    const cid = this.classId();
    if (!cid) {
      this.cells.set({});
      return;
    }
    const sec = this.sectionChoices().length > 0 ? (code ?? '') : '';
    this.cells.set(loadClassGrid(ttGridStorageKey(cid, sec)));
  }

  cell(dayId: number, periodId: number): TtCell {
    const k = ttCellKey(dayId, periodId);
    return this.cells()[k] ?? { subject: '', teacher: '', room: '' };
  }

  slotFilled(dayId: number, periodId: number): boolean {
    const s = this.cell(dayId, periodId);
    return !!(s.subject?.trim() || s.teacher?.trim() || s.room?.trim());
  }

  periodColumnPercent(): number {
    return 14;
  }

  dayColumnPercent(): number {
    const d = this.days().length || 1;
    return (100 - this.periodColumnPercent()) / d;
  }

  print(): void {
    window.print();
  }
}
