const STORAGE_KEY = 'skolix_student_hw_done';

function readIds(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as number[]).filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

function writeIds(ids: number[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]));
}

export function isHomeworkDone(id: number): boolean {
  return readIds().includes(id);
}

export function toggleHomeworkDone(id: number): boolean {
  const cur = readIds();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  writeIds(next);
  return next.includes(id);
}

export function setHomeworkDone(id: number, done: boolean): void {
  const cur = readIds();
  const next = done ? [...new Set([...cur, id])] : cur.filter((x) => x !== id);
  writeIds(next);
}

export type HomeworkDueStatus = 'completed' | 'pending' | 'overdue';

export function homeworkDueStatus(id: number, dueDateIso: string, todayIso: string): HomeworkDueStatus {
  if (isHomeworkDone(id)) return 'completed';
  const d = (dueDateIso || '').slice(0, 10);
  if (d && d < todayIso) return 'overdue';
  return 'pending';
}
