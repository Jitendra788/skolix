/** Mirrors `class-tests.component.ts` local persistence. */

export const CLASS_TEST_RECORDS_KEY = 'class-test-records-v1';

export interface SavedMarkRow {
  student_id: number;
  admission_no: string;
  student_name: string;
  obtained_marks: number;
}

export interface SavedTestRecord {
  id: string;
  class_name: string;
  subject: string;
  test_date: string;
  total_marks: number;
  rows: SavedMarkRow[];
  saved_at: string;
}

export function readClassTestRecords(): SavedTestRecord[] {
  try {
    const raw = localStorage.getItem(CLASS_TEST_RECORDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SavedTestRecord[]) : [];
  } catch {
    return [];
  }
}

/** One row per subject: totals across all saved class tests for that class. */
export function classTestSubjectsForStudent(
  studentId: number,
  className: string,
): { subject: string; total_tests: number; total_marks: number; obtained_marks: number; percent: number }[] {
  const cn = className.trim();
  if (!cn) return [];
  const bySubject = new Map<string, { tests: number; ob: number; tot: number }>();
  for (const rec of readClassTestRecords()) {
    if ((rec.class_name || '').trim() !== cn) continue;
    const row = rec.rows.find((x) => x.student_id === studentId);
    if (!row) continue;
    const sub = (rec.subject || '').trim() || 'Subject';
    const cur = bySubject.get(sub) ?? { tests: 0, ob: 0, tot: 0 };
    cur.tests += 1;
    cur.ob += Number(row.obtained_marks) || 0;
    cur.tot += Number(rec.total_marks) || 0;
    bySubject.set(sub, cur);
  }
  return [...bySubject.entries()].map(([subject, v]) => ({
    subject,
    total_tests: v.tests,
    total_marks: v.tot,
    obtained_marks: v.ob,
    percent: v.tot > 0 ? Math.round((100 * v.ob) / v.tot) : 0,
  }));
}

export function classTestOverallForStudent(
  studentId: number,
  className: string,
): { tests: number; obtained: number; total: number; percent: number } {
  const subjects = classTestSubjectsForStudent(studentId, className);
  const tests = subjects.reduce((a, s) => a + s.total_tests, 0);
  const obtained = subjects.reduce((a, s) => a + s.obtained_marks, 0);
  const total = subjects.reduce((a, s) => a + s.total_marks, 0);
  const percent = total > 0 ? Math.round((100 * obtained) / total) : 0;
  return { tests, obtained, total, percent };
}
