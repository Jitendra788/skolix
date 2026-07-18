/** Local timetable master data (aligned with Weekdays / Time Periods pages). */

export const TT_WEEKDAYS_KEY = 'tt-weekdays-v1';
export const TT_PERIODS_KEY = 'tt-time-periods-v1';
export const TT_TIMETABLE_GRID_KEY = 'tt-timetable-grid-v1';
export const TT_CLASSROOMS_KEY = 'tt-classrooms-v1';
/** Set after one-time demo seed so we do not keep writing localStorage. */
export const TT_SAMPLE_ENTRY_DONE_KEY = 'tt-sample-entry-v2';
const TT_SAMPLE_ENTRY_DONE_KEY_V1 = 'tt-sample-entry-v1';

export type TtPeriodKind = 'teaching' | 'break' | 'assembly';

export interface TtWeekdayRow {
  id: number;
  label: string;
  active: boolean;
}

export interface TtPeriodRow {
  id: number;
  name: string;
  start: string;
  end: string;
  /** Teaching period vs recess/lunch vs assembly — default teaching when missing (old data). */
  kind?: TtPeriodKind;
}

export interface TtCell {
  subject: string;
  teacher: string;
  room?: string;
}

/** classId or "classId|section" → cellKey → cell */
export type TtFullGrid = Record<string, Record<string, TtCell>>;

export interface TtClassroomRow {
  id: number;
  name: string;
  capacity: string;
}

/** Typical school week: Mon–Fri on; Sat–Sun off (editable on Weekdays page). */
const defaultWeekdays: TtWeekdayRow[] = [
  { id: 1, label: 'Monday', active: true },
  { id: 2, label: 'Tuesday', active: true },
  { id: 3, label: 'Wednesday', active: true },
  { id: 4, label: 'Thursday', active: true },
  { id: 5, label: 'Friday', active: true },
  { id: 6, label: 'Saturday', active: false },
  { id: 7, label: 'Sunday', active: false },
];

export function ttPeriodKind(p: TtPeriodRow): TtPeriodKind {
  const k = p.kind;
  if (k === 'break' || k === 'assembly') return k;
  return 'teaching';
}

export function loadWeekdays(): TtWeekdayRow[] {
  try {
    const raw = localStorage.getItem(TT_WEEKDAYS_KEY);
    if (!raw) return defaultWeekdays;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TtWeekdayRow[]) : defaultWeekdays;
  } catch {
    return defaultWeekdays;
  }
}

export function loadActiveWeekdays(): TtWeekdayRow[] {
  return loadWeekdays()
    .filter((d) => d.active)
    .sort((a, b) => a.id - b.id);
}

export function loadPeriods(): TtPeriodRow[] {
  try {
    const raw = localStorage.getItem(TT_PERIODS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TtPeriodRow[]) : [];
  } catch {
    return [];
  }
}

export function ttCellKey(dayId: number, periodId: number): string {
  return `${dayId}-${periodId}`;
}

/** True when at least one cell has subject / teacher / room text. */
export function ttHasFilledCells(cells: Record<string, TtCell>): boolean {
  return Object.values(cells).some((c) => {
    const s = `${c.subject || ''}${c.teacher || ''}${c.room || ''}`.trim();
    return !!s;
  });
}

export interface ResolvedStudentTimetable {
  cells: Record<string, TtCell>;
  /** Class name from roster (plus section suffix when relevant). */
  label: string;
  /** Student class_name did not match any school class master row. */
  noClassMatch: boolean;
}

/**
 * Match student roster class name to school_classes id, load local timetable grid.
 * Prefer section-specific grid when the class has sections; fall back to class-wide grid when empty.
 */
export function resolveStudentTimetable(
  className: string,
  studentSection: string | undefined,
  schoolClasses: { id: number; name: string; sections?: string[] }[],
): ResolvedStudentTimetable {
  const norm = (s: string) => s.trim().toLowerCase();
  const name = (className || '').trim();
  const row = schoolClasses.find((c) => norm(c.name) === norm(name));
  if (!row) {
    return { cells: {}, label: name || 'Your class', noClassMatch: true };
  }
  const classIdStr = String(row.id);
  const secs = [...new Set((row.sections ?? []).map((x) => String(x).trim()).filter(Boolean))];
  const studentSec = (studentSection || '').trim();

  const keysToTry: string[] = [];
  if (secs.length && studentSec) {
    keysToTry.push(ttGridStorageKey(classIdStr, studentSec));
  }
  keysToTry.push(ttGridStorageKey(classIdStr, ''));

  let chosen = keysToTry[0] ?? ttGridStorageKey(classIdStr, '');
  for (const k of keysToTry) {
    const grid = loadClassGrid(k);
    if (ttHasFilledCells(grid)) {
      chosen = k;
      break;
    }
  }
  const cells = loadClassGrid(chosen);

  let label = row.name;
  if (secs.length && studentSec) {
    label = `${label} · Sec ${studentSec}`;
  }
  return { cells, label, noClassMatch: false };
}

export function ttGridStorageKey(classId: string, sectionCode: string): string {
  const s = (sectionCode || '').trim();
  if (!s) return classId;
  return `${classId}|${s}`;
}

export function ttParseGridStorageKey(key: string): { classId: string; section: string } {
  const i = key.indexOf('|');
  if (i === -1) return { classId: key, section: '' };
  return { classId: key.slice(0, i), section: key.slice(i + 1) };
}

export function loadClassrooms(): TtClassroomRow[] {
  try {
    const raw = localStorage.getItem(TT_CLASSROOMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as TtClassroomRow[]) : [];
  } catch {
    return [];
  }
}

export function loadFullGrid(): TtFullGrid {
  try {
    const raw = localStorage.getItem(TT_TIMETABLE_GRID_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as TtFullGrid)
      : {};
  } catch {
    return {};
  }
}

export function saveClassGrid(storageKey: string, cells: Record<string, TtCell>): void {
  const all = loadFullGrid();
  all[storageKey] = cells;
  localStorage.setItem(TT_TIMETABLE_GRID_KEY, JSON.stringify(all));
}

export function loadClassGrid(storageKey: string): Record<string, TtCell> {
  return { ...(loadFullGrid()[storageKey] ?? {}) };
}

/**
 * One-time demo reset: clears timetable grid and inserts sample cells in first four classes
 * (Mon / first active day, first teaching period). If periods list is empty, adds a small
 * school-like day (Period I–II, recess, Period III). Runs once per browser (flag in localStorage).
 */
export function ensureTimetableSampleEntry(
  classes: { id: number; sort_order?: number; name: string }[],
  teacherName: string
): void {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(TT_SAMPLE_ENTRY_DONE_KEY) === '1') return;
  localStorage.removeItem(TT_SAMPLE_ENTRY_DONE_KEY_V1);

  if (loadPeriods().length === 0) {
    const samplePeriods: TtPeriodRow[] = [
      { id: 1, name: 'Period I', start: '09:00', end: '09:45', kind: 'teaching' },
      { id: 2, name: 'Period II', start: '09:45', end: '10:30', kind: 'teaching' },
      { id: 3, name: 'Recess', start: '10:30', end: '10:50', kind: 'break' },
      { id: 4, name: 'Period III', start: '10:50', end: '11:35', kind: 'teaching' },
    ];
    localStorage.setItem(TT_PERIODS_KEY, JSON.stringify(samplePeriods));
  }

  const periods = loadPeriods();
  const firstTeaching = periods.find((p) => ttPeriodKind(p) === 'teaching');
  const sorted = [...classes].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
  );

  if (firstTeaching && sorted.length > 0) {
    const activeDays = loadActiveWeekdays();
    const dayId = activeDays[0]?.id ?? 1;
    const cellKey = ttCellKey(dayId, firstTeaching.id);
    const fallbackTeacher = (teacherName || '').trim() || 'Class Teacher';
    const nextGrid: TtFullGrid = {};

    const sampleRows = [
      { subject: 'Mathematics', teacher: fallbackTeacher, room: 'Room 101' },
      { subject: 'Science', teacher: 'Science Teacher', room: 'Room 102' },
      { subject: 'English', teacher: 'English Teacher', room: 'Room 103' },
      { subject: 'Computer', teacher: 'Computer Teacher', room: 'Room 104' },
    ];

    for (let i = 0; i < Math.min(sorted.length, sampleRows.length); i++) {
      const classId = String(sorted[i].id);
      nextGrid[classId] = { [cellKey]: sampleRows[i] };
    }

    localStorage.setItem(TT_TIMETABLE_GRID_KEY, JSON.stringify(nextGrid));
  }

  localStorage.setItem(TT_SAMPLE_ENTRY_DONE_KEY, '1');
}
