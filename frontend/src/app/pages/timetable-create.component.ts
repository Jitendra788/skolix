import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TimetableFlowNavComponent } from './timetable-flow-nav.component';
import { ApiService } from '../core/api.service';
import { SchoolRefService } from '../core/school-ref.service';
import {
  TtCell,
  loadActiveWeekdays,
  loadClassGrid,
  loadFullGrid,
  loadClassrooms,
  loadPeriods,
  saveClassGrid,
  ttParseGridStorageKey,
  ttCellKey,
  ttGridStorageKey,
  ttPeriodKind,
} from '../core/timetable-local.util';

@Component({
  selector: 'app-timetable-create',
  standalone: true,
  imports: [CommonModule, FormsModule, TimetableFlowNavComponent],
  template: `
    <section class="tc-page">
      <header class="tc-head">
        <h1>Timetable - Create</h1>
        <p>
          Choose class → fill <strong>Subject</strong>, <strong>Teacher</strong>, <strong>Room</strong> for each cell. Use the
          step bar below to set weekdays and periods first. Data stays in this browser only — remember to
          <strong>Save</strong>.
        </p>
      </header>

      <section class="tc-card">
        <app-timetable-flow-nav />
        @if (classId()) {
          <div class="tc-summary">
            <span class="tc-sum-main">{{ selectionSummary() }}</span>
            <span class="tc-sum-meta"
              >{{ filledCount() }} / {{ teachingSlotTotal() }} teaching slots filled</span
            >
          </div>
        }
        <div class="tc-toolbar">
          <label class="tc-field">
            <span>Class</span>
            <select [ngModel]="classId()" (ngModelChange)="onClassChange($event)">
              <option value="">Select class</option>
              @for (c of classOptions(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>
          </label>
          @if (sectionChoices().length > 0) {
            <label class="tc-field">
              <span>Section</span>
              <select [ngModel]="sectionCode()" (ngModelChange)="onSectionChange($event)">
                <option value="">All Sections</option>
                @for (sec of sectionChoices(); track sec) {
                  <option [value]="sec">Section {{ sec }}</option>
                }
              </select>
            </label>
          }
          <button type="button" class="tc-save" [disabled]="!classId()" (click)="save()">Save timetable</button>
        </div>

        @if (!hasDays() || !hasPeriods()) {
          <p class="tc-warn">
            @if (!hasDays()) {
              <span>Set active weekdays under <strong>Timetable → Weekdays</strong>.</span>
            }
            @if (!hasPeriods()) {
              <span>Add periods under <strong>Timetable → Time Periods</strong>.</span>
            }
          </p>
        }

        @if (message()) {
          <p class="tc-msg">{{ message() }}</p>
        }

        <datalist id="tc-teacher-suggestions">
          @for (n of teacherSuggestionNames(); track n) {
            <option [value]="n"></option>
          }
        </datalist>
        <datalist id="tc-subject-suggestions">
          @for (s of subjectNames(); track s) {
            <option [value]="s"></option>
          }
        </datalist>
        <datalist id="tc-room-suggestions">
          @for (r of roomNames(); track r) {
            <option [value]="r"></option>
          }
        </datalist>

        @if (classId() && hasDays() && hasPeriods()) {
          <div class="tc-scroll">
            <table class="tc-grid">
              <thead>
                <tr>
                  <th class="tc-corner" [style.width.%]="periodColumnPercent()">Period / time</th>
                  @for (d of days(); track d.id) {
                    <th [style.width.%]="dayColumnPercent()">{{ d.label }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (p of periods(); track p.id) {
                  @if (ttPeriodKind(p) !== 'teaching') {
                    <tr
                      class="tc-row-non-teach"
                      [class.tc-row-assembly]="ttPeriodKind(p) === 'assembly'"
                    >
                      <th class="tc-period" [style.width.%]="periodColumnPercent()">
                        {{ p.name }}
                        <span class="tc-time">{{ p.start }} – {{ p.end }}</span>
                        <span class="tc-ptype">{{ ttPeriodKind(p) === 'assembly' ? 'Assembly' : 'Break' }}</span>
                      </th>
                      <td class="tc-break-cell" [attr.colspan]="days().length">
                        {{ p.name }}
                      </td>
                    </tr>
                  } @else {
                    <tr>
                      <th class="tc-period" [style.width.%]="periodColumnPercent()">
                        {{ p.name }}
                        <span class="tc-time">{{ p.start }} – {{ p.end }}</span>
                      </th>
                      @for (d of days(); track d.id) {
                        <td
                          class="tc-cell"
                          [class.tc-cell-filled]="cellFilled(d.id, p.id)"
                          [style.width.%]="dayColumnPercent()"
                        >
                          <input
                            type="text"
                            placeholder="Subject"
                            class="tc-in"
                            list="tc-subject-suggestions"
                            [ngModel]="text(d.id, p.id, 'subject')"
                            (ngModelChange)="patch(d.id, p.id, 'subject', $event)"
                          />
                          <input
                            type="text"
                            placeholder="Teacher"
                            class="tc-in"
                            list="tc-teacher-suggestions"
                            [ngModel]="text(d.id, p.id, 'teacher')"
                            (focus)="onTeacherFocus(d.id, p.id)"
                            (ngModelChange)="patch(d.id, p.id, 'teacher', $event)"
                          />
                          <input
                            type="text"
                            placeholder="Room"
                            class="tc-in tc-in-room"
                            list="tc-room-suggestions"
                            [ngModel]="text(d.id, p.id, 'room')"
                            (ngModelChange)="patch(d.id, p.id, 'room', $event)"
                          />
                        </td>
                      }
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        } @else if (!classId()) {
          <p class="tc-hint">Select a class to edit the grid.</p>
        }
      </section>
    </section>
  `,
  styles: [
    `
      .tc-page {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .tc-head {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 0.85rem 1rem;
      }
      .tc-head h1 {
        margin: 0;
        font-size: 1.05rem;
      }
      .tc-head p {
        margin: 0.25rem 0 0;
        color: var(--muted);
        font-size: 0.86rem;
      }
      .tc-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 1rem;
      }
      .tc-summary {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.5rem 1rem;
        margin-bottom: 0.75rem;
        padding: 0.55rem 0.75rem;
        background: var(--welcome-banner);
        border: 1px solid var(--border);
        border-radius: 10px;
      }
      .tc-sum-main {
        font-weight: 700;
        color: var(--text);
        font-size: 0.92rem;
      }
      .tc-sum-meta {
        font-size: 0.8rem;
        color: var(--muted);
        font-weight: 600;
      }
      .tc-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: flex-end;
        margin-bottom: 0.75rem;
      }
      .tc-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 200px;
      }
      .tc-field span {
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .tc-field select {
        min-height: 40px;
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 0.45rem 0.6rem;
        font: inherit;
      }
      .tc-save {
        border: none;
        border-radius: 999px;
        min-height: 40px;
        padding: 0.5rem 1.1rem;
        background: linear-gradient(135deg, #f59e0b, #fbbf24);
        color: #111827;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      .tc-save:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .tc-warn {
        margin: 0 0 0.75rem;
        padding: 0.65rem 0.75rem;
        border-radius: 10px;
        background: #fffbeb;
        border: 1px solid #fde68a;
        color: #92400e;
        font-size: 0.88rem;
      }
      .tc-warn span + span::before {
        content: ' ';
      }
      .tc-msg {
        margin: 0 0 0.75rem;
        color: #0f766e;
        font-weight: 600;
      }
      .tc-hint {
        margin: 0.5rem 0 0;
        color: var(--muted);
      }
      .tc-scroll {
        overflow: auto;
        max-width: 100%;
        border: 1px solid var(--border);
        border-radius: 10px;
        max-height: min(70vh, 900px);
        position: relative;
      }
      .tc-grid {
        border-collapse: separate;
        border-spacing: 0;
        width: 100%;
        min-width: 100%;
        table-layout: fixed;
      }
      .tc-grid th,
      .tc-grid td {
        border: 1px solid var(--border);
        padding: 0.35rem;
        vertical-align: top;
      }
      .tc-grid thead th {
        background: var(--bg-subtle);
        font-size: 0.78rem;
        text-align: center;
      }
      .tc-corner {
        width: 14%;
        min-width: 130px;
        position: sticky;
        top: 0;
        left: 0;
        z-index: 4;
        background: var(--bg-subtle);
        box-shadow: 2px 2px 0 rgba(15, 23, 42, 0.06);
      }
      .tc-period {
        text-align: left;
        background: var(--bg-subtle);
        font-size: 0.82rem;
        width: 14%;
        min-width: 120px;
        position: sticky;
        left: 0;
        z-index: 2;
        box-shadow: 4px 0 12px -6px rgba(15, 23, 42, 0.12);
      }
      .tc-grid thead th:not(.tc-corner) {
        position: sticky;
        top: 0;
        z-index: 1;
        background: var(--bg-subtle);
        box-shadow: 0 1px 0 var(--border);
      }
      .tc-time {
        display: block;
        font-weight: 400;
        font-size: 0.72rem;
        color: var(--muted);
      }
      .tc-ptype {
        display: block;
        font-size: 0.68rem;
        font-weight: 700;
        text-transform: uppercase;
        color: #92400e;
        margin-top: 0.2rem;
      }
      .tc-row-non-teach .tc-period {
        background: #fefce8;
      }
      .tc-break-cell {
        text-align: center;
        font-weight: 700;
        font-size: 0.9rem;
        color: #334155;
        background: #f1f5f9;
        vertical-align: middle;
        padding: 0.65rem;
      }
      .tc-row-assembly .tc-break-cell {
        background: #fffbeb;
      }
      .tc-cell {
        min-width: 0;
        background: var(--surface);
        word-break: break-word;
      }
      .tc-grid tbody tr:not(.tc-row-non-teach) td:nth-child(even) {
        background: rgba(248, 250, 252, 0.85);
      }
      .tc-cell-filled {
        box-shadow: inset 0 0 0 2px rgba(79, 70, 229, 0.2);
        background: rgba(238, 242, 255, 0.55) !important;
      }
      .tc-in {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 0.35rem 0.45rem;
        font: inherit;
        font-size: 0.8rem;
        margin-bottom: 0.25rem;
      }
      .tc-in:focus {
        outline: none;
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--ring);
      }
      .tc-in-room {
        font-size: 0.76rem;
        color: #475569;
      }
      .tc-in:last-child {
        margin-bottom: 0;
      }
    `,
  ],
})
export class TimetableCreateComponent implements OnInit {
  private readonly schoolRef = inject(SchoolRefService);
  private readonly api = inject(ApiService);

  readonly classId = signal('');
  readonly sectionCode = signal('');
  readonly cells = signal<Record<string, TtCell>>({});
  readonly message = signal('');
  readonly facultyRows = signal<{ name: string; subject: string }[]>([]);
  readonly focusedTeacherSubject = signal('');
  readonly subjectNames = signal<string[]>([]);
  readonly roomNames = signal<string[]>([]);

  readonly days = signal(loadActiveWeekdays());
  readonly periods = signal(loadPeriods());

  readonly ttPeriodKind = ttPeriodKind;

  readonly classOptions = computed(() =>
    [...this.schoolRef.classes()].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  );
  readonly facultyNames = computed(() =>
    [...new Set(this.facultyRows().map((f) => f.name.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  );
  readonly teacherSuggestionNames = computed(() => {
    const subject = this.focusedTeacherSubject().trim();
    if (!subject) return this.facultyNames();
    const normalizedSubject = this.normalizeSlotResource(subject);
    const filtered = this.facultyRows()
      .filter((f) => this.teacherHasSubject(f.subject, normalizedSubject))
      .map((f) => f.name.trim())
      .filter(Boolean);
    if (filtered.length === 0) return this.facultyNames();
    return [...new Set(filtered)].sort((a, b) => a.localeCompare(b));
  });

  readonly sectionChoices = computed(() => {
    const id = this.classId();
    if (!id) return [] as string[];
    const row = this.schoolRef.classes().find((c) => String(c.id) === id);
    const raw = row?.sections ?? [];
    const list = raw.map((s) => String(s).trim()).filter(Boolean);
    return [...new Set(list)].sort((a, b) => a.localeCompare(b));
  });

  readonly selectionSummary = computed(() => {
    const cid = this.classId();
    if (!cid) return '';
    const row = this.schoolRef.classes().find((c) => String(c.id) === cid);
    const name = row?.name ?? `Class ${cid}`;
    const sec = this.sectionCode().trim();
    if (this.sectionChoices().length > 0 && sec) {
      return `${name} · Section ${sec}`;
    }
    if (this.sectionChoices().length > 0 && !sec) {
      return `${name} · All Sections`;
    }
    return name;
  });

  readonly filledCount = computed(() => {
    let n = 0;
    for (const c of Object.values(this.cells())) {
      if ((c.subject || '').trim() || (c.teacher || '').trim() || (c.room || '').trim()) n++;
    }
    return n;
  });

  readonly teachingSlotTotal = computed(() => {
    const d = this.days().length;
    const t = this.periods().filter((p) => ttPeriodKind(p) === 'teaching').length;
    return d * t;
  });

  ngOnInit(): void {
    this.refreshRoomNames();
    this.api.listFaculty().subscribe({
      next: (list) =>
        this.facultyRows.set(
          list
            .map((f) => ({ name: (f.name || '').trim(), subject: (f.subject || '').trim() }))
            .filter((f) => f.name)
        ),
      error: () => this.facultyRows.set([]),
    });
  }

  @HostListener('document:visibilitychange')
  onVisibility(): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.refreshRoomNames();
    }
  }

  private refreshRoomNames(): void {
    this.roomNames.set(
      loadClassrooms()
        .map((r) => r.name.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
    );
  }

  cellFilled(dayId: number, periodId: number): boolean {
    const c = this.cells()[ttCellKey(dayId, periodId)];
    if (!c) return false;
    return !!(c.subject?.trim() || c.teacher?.trim() || c.room?.trim());
  }

  periodColumnPercent(): number {
    return 14;
  }

  dayColumnPercent(): number {
    const d = this.days().length || 1;
    return (100 - this.periodColumnPercent()) / d;
  }

  hasDays(): boolean {
    return this.days().length > 0;
  }

  hasPeriods(): boolean {
    return this.periods().length > 0;
  }

  private refreshSubjects(): void {
    const id = this.classId();
    if (!id) {
      this.subjectNames.set([]);
      return;
    }
    const n = Number(id);
    if (!Number.isFinite(n)) {
      this.subjectNames.set([]);
      return;
    }
    this.api.listClassSubjects(n).subscribe({
      next: (rows) =>
        this.subjectNames.set(
          [...new Set(rows.map((r) => (r.subject_name || '').trim()).filter(Boolean))].sort((a, b) =>
            a.localeCompare(b)
          )
        ),
      error: () => this.subjectNames.set([]),
    });
  }

  private currentStorageKey(): string {
    const cid = this.classId();
    if (!cid) return '';
    const sec = this.sectionChoices().length > 0 ? this.sectionCode() : '';
    return ttGridStorageKey(cid, sec);
  }

  onClassChange(id: string | number): void {
    const s = id === '' || id === null || id === undefined ? '' : String(id);
    this.classId.set(s);
    this.sectionCode.set('');
    this.message.set('');
    this.cells.set(s ? loadClassGrid(ttGridStorageKey(s, '')) : {});
    this.days.set(loadActiveWeekdays());
    this.periods.set(loadPeriods());
    this.refreshSubjects();
  }

  onSectionChange(code: string): void {
    this.sectionCode.set(code ?? '');
    const cid = this.classId();
    this.message.set('');
    if (!cid) {
      this.cells.set({});
      return;
    }
    const sec = this.sectionChoices().length > 0 ? (code ?? '') : '';
    this.cells.set(loadClassGrid(ttGridStorageKey(cid, sec)));
  }

  text(dayId: number, periodId: number, field: keyof TtCell): string {
    const k = ttCellKey(dayId, periodId);
    const c = this.cells()[k];
    const v = c?.[field];
    return typeof v === 'string' ? v : '';
  }

  onTeacherFocus(dayId: number, periodId: number): void {
    const k = ttCellKey(dayId, periodId);
    this.focusedTeacherSubject.set((this.cells()[k]?.subject || '').trim());
  }

  patch(dayId: number, periodId: number, field: keyof TtCell, value: string): void {
    const k = ttCellKey(dayId, periodId);
    const prev = this.cells()[k] ?? { subject: '', teacher: '', room: '' };
    if (field === 'subject') {
      this.focusedTeacherSubject.set(value ?? '');
      const nextSubject = (value || '').trim();
      const currentTeacher = (prev.teacher || '').trim();
      if (nextSubject && currentTeacher && !this.isTeacherAllowedForSubject(currentTeacher, nextSubject)) {
        this.cells.set({
          ...this.cells(),
          [k]: { ...prev, subject: value, teacher: '' },
        });
        this.message.set(`Teacher "${currentTeacher}" is not mapped to subject "${nextSubject}".`);
        return;
      }
    }
    const storageKey = this.currentStorageKey();
    if (field === 'teacher' && storageKey) {
      const typedTeacher = (value || '').trim();
      const chosenSubject = (prev.subject || '').trim();
      if (typedTeacher && chosenSubject && !this.isTeacherAllowedForSubject(typedTeacher, chosenSubject)) {
        this.message.set(`Teacher "${typedTeacher}" is not mapped to subject "${chosenSubject}".`);
        return;
      }
      if (typedTeacher) {
        const conflict = this.findTeacherConflictForSlot(storageKey, k, typedTeacher);
        if (conflict) {
          this.message.set(
            `Teacher "${conflict.teacher}" is already assigned in ${conflict.targetLabel} at the same period.`
          );
          return;
        }
      }
    }
    if (field === 'room' && storageKey) {
      const typedRoom = (value || '').trim();
      if (typedRoom) {
        const conflict = this.findRoomConflictForSlot(storageKey, k, typedRoom);
        if (conflict) {
          this.message.set(`Room "${conflict.room}" is already assigned in ${conflict.targetLabel} at the same period.`);
          return;
        }
      }
    }
    this.cells.set({
      ...this.cells(),
      [k]: { ...prev, [field]: value },
    });
    this.message.set('');
  }

  save(): void {
    const key = this.currentStorageKey();
    if (!key) return;
    const teacherConflict = this.findTeacherConflict(key, this.cells());
    if (teacherConflict) {
      this.message.set(
        `Teacher "${teacherConflict.teacher}" is already assigned in ${teacherConflict.targetLabel} at the same period.`
      );
      return;
    }
    const roomConflict = this.findRoomConflict(key, this.cells());
    if (roomConflict) {
      this.message.set(
        `Room "${roomConflict.room}" is already assigned in ${roomConflict.targetLabel} at the same period.`
      );
      return;
    }
    saveClassGrid(key, this.cells());
    this.message.set('Timetable saved.');
  }

  private findTeacherConflict(
    currentStorageKey: string,
    draftCells: Record<string, TtCell>
  ): { teacher: string; targetLabel: string } | null {
    const all = loadFullGrid();
    const classMap = new Map(this.schoolRef.classes().map((c) => [String(c.id), c.name]));
    const draftBySlot = new Map<string, string>();

    for (const [slotKey, cell] of Object.entries(draftCells)) {
      const teacher = (cell.teacher || '').trim();
      if (!teacher) continue;
      draftBySlot.set(slotKey, this.normalizeSlotResource(teacher));
    }

    if (draftBySlot.size === 0) return null;

    for (const [otherStorageKey, otherCells] of Object.entries(all)) {
      if (otherStorageKey === currentStorageKey) continue;
      for (const [slotKey, otherCell] of Object.entries(otherCells || {})) {
        const otherTeacher = (otherCell.teacher || '').trim();
        if (!otherTeacher) continue;
        const wanted = draftBySlot.get(slotKey);
        if (!wanted) continue;
        if (this.normalizeSlotResource(otherTeacher) !== wanted) continue;
        const parsed = ttParseGridStorageKey(otherStorageKey);
        const className = classMap.get(parsed.classId) ?? `Class ${parsed.classId}`;
        const targetLabel = parsed.section ? `${className} (Section ${parsed.section})` : className;
        return { teacher: otherTeacher, targetLabel };
      }
    }

    return null;
  }

  private findTeacherConflictForSlot(
    currentStorageKey: string,
    slotKey: string,
    teacherName: string
  ): { teacher: string; targetLabel: string } | null {
    const all = loadFullGrid();
    const classMap = new Map(this.schoolRef.classes().map((c) => [String(c.id), c.name]));
    const wanted = this.normalizeSlotResource(teacherName);
    if (!wanted) return null;

    for (const [otherStorageKey, otherCells] of Object.entries(all)) {
      if (otherStorageKey === currentStorageKey) continue;
      const otherTeacher = (otherCells?.[slotKey]?.teacher || '').trim();
      if (!otherTeacher) continue;
      if (this.normalizeSlotResource(otherTeacher) !== wanted) continue;
      const parsed = ttParseGridStorageKey(otherStorageKey);
      const className = classMap.get(parsed.classId) ?? `Class ${parsed.classId}`;
      const targetLabel = parsed.section ? `${className} (Section ${parsed.section})` : className;
      return { teacher: otherTeacher, targetLabel };
    }

    return null;
  }

  private findRoomConflict(
    currentStorageKey: string,
    draftCells: Record<string, TtCell>
  ): { room: string; targetLabel: string } | null {
    const all = loadFullGrid();
    const classMap = new Map(this.schoolRef.classes().map((c) => [String(c.id), c.name]));
    const draftBySlot = new Map<string, string>();

    for (const [slotKey, cell] of Object.entries(draftCells)) {
      const room = (cell.room || '').trim();
      if (!room) continue;
      draftBySlot.set(slotKey, this.normalizeSlotResource(room));
    }

    if (draftBySlot.size === 0) return null;

    for (const [otherStorageKey, otherCells] of Object.entries(all)) {
      if (otherStorageKey === currentStorageKey) continue;
      for (const [slotKey, otherCell] of Object.entries(otherCells || {})) {
        const otherRoom = (otherCell.room || '').trim();
        if (!otherRoom) continue;
        const wanted = draftBySlot.get(slotKey);
        if (!wanted) continue;
        if (this.normalizeSlotResource(otherRoom) !== wanted) continue;
        const parsed = ttParseGridStorageKey(otherStorageKey);
        const className = classMap.get(parsed.classId) ?? `Class ${parsed.classId}`;
        const targetLabel = parsed.section ? `${className} (Section ${parsed.section})` : className;
        return { room: otherRoom, targetLabel };
      }
    }

    return null;
  }

  private findRoomConflictForSlot(
    currentStorageKey: string,
    slotKey: string,
    roomName: string
  ): { room: string; targetLabel: string } | null {
    const all = loadFullGrid();
    const classMap = new Map(this.schoolRef.classes().map((c) => [String(c.id), c.name]));
    const wanted = this.normalizeSlotResource(roomName);
    if (!wanted) return null;

    for (const [otherStorageKey, otherCells] of Object.entries(all)) {
      if (otherStorageKey === currentStorageKey) continue;
      const otherRoom = (otherCells?.[slotKey]?.room || '').trim();
      if (!otherRoom) continue;
      if (this.normalizeSlotResource(otherRoom) !== wanted) continue;
      const parsed = ttParseGridStorageKey(otherStorageKey);
      const className = classMap.get(parsed.classId) ?? `Class ${parsed.classId}`;
      const targetLabel = parsed.section ? `${className} (Section ${parsed.section})` : className;
      return { room: otherRoom, targetLabel };
    }

    return null;
  }

  private normalizeSlotResource(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  private isTeacherAllowedForSubject(teacherName: string, subjectName: string): boolean {
    const teacher = this.normalizeSlotResource(teacherName);
    const subject = this.normalizeSlotResource(subjectName);
    if (!teacher || !subject) return true;
    const row = this.facultyRows().find((f) => this.normalizeSlotResource(f.name) === teacher);
    if (!row) return true;
    return this.teacherHasSubject(row.subject, subject);
  }

  private teacherHasSubject(rawSubjectList: string, subject: string): boolean {
    const normalized = this.normalizeSlotResource(rawSubjectList);
    if (!normalized) return false;
    const tokens = normalized
      .split(/[,&/|]+/)
      .map((s) => this.normalizeSlotResource(s))
      .filter(Boolean);
    if (tokens.includes(subject)) return true;
    return normalized.includes(subject);
  }
}
