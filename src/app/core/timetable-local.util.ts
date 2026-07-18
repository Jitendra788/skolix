/** Local timetable master data (aligned with Weekdays / Time Periods pages). */

export const TT_WEEKDAYS_KEY = 'tt-weekdays-v1';
export const TT_PERIODS_KEY = 'tt-time-periods-v1';
export const TT_TIMETABLE_GRID_KEY = 'tt-timetable-grid-v1';
export const TT_CLASSROOMS_KEY = 'tt-classrooms-v1';
/** Set after one-time demo seed so we do not keep writing localStorage. */
export const TT_SAMPLE_ENTRY_DONE_KEY = 'tt-sample-entry-v1';

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
 * If the timetable grid is still empty, inserts one sample cell (Mon / first active day,
 * first teaching period) on the first class from the API. If periods list is empty, adds a
 * small school-like day (Period I–II, recess, Period III). Runs once per browser (flag in localStorage).
 */
export function ensureTimetableSampleEntry(
  classes: { id: number; sort_order?: number; name: string }[],
  teacherName: string
): void {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(TT_SAMPLE_ENTRY_DONE_KEY) === '1') return;

  const grid = loadFullGrid();
  const anyCells = Object.values(grid).some((cells) => Object.keys(cells).length > 0);
  if (anyCells) {
    localStorage.setItem(TT_SAMPLE_ENTRY_DONE_KEY, '1');
    return;
  }

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
    const classId = String(sorted[0].id);
    const cells = loadClassGrid(classId);
    if (Object.keys(cells).length === 0) {
      const activeDays = loadActiveWeekdays();
      const dayId = activeDays[0]?.id ?? 1;
      const key = ttCellKey(dayId, firstTeaching.id);
      const t = (teacherName || '').trim() || 'Class Teacher';
      saveClassGrid(classId, { ...cells, [key]: { subject: 'Mathematics', teacher: t, room: 'Room 101' } });
    }
  }

  localStorage.setItem(TT_SAMPLE_ENTRY_DONE_KEY, '1');
}
