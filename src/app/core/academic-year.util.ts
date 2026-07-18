/**
 * India school session: April → March, label e.g. 2025-26 (matches backend academic_year_for_date).
 */
export function indiaAcademicYearLabel(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const y0 = m >= 4 ? y : y - 1;
  return `${y0}-${String(y0 + 1).slice(-2)}`;
}

/** ISO date string `YYYY-MM-DD` → session label, or null if missing/invalid. */
export function academicYearLabelForIsoDate(iso: string | undefined | null): string | null {
  if (!iso?.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return null;
  return indiaAcademicYearLabel(d);
}
