/** YYYY-MM-DD or leading ISO fragment; avoids UTC shift for calendar dates. */
export function parseCalendarDate(raw: string | undefined | null): Date | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) {
    const y = +iso[1];
    const m = +iso[2] - 1;
    const d = +iso[3];
    const dt = new Date(y, m, d);
    if (dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d) {
      return dt;
    }
  }
  const dt = new Date(t);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Next calendar occurrence of month/day from `anchor` on or after `ref`. */
export function nextAnnualOccurrence(anchor: Date, ref: Date): Date {
  const r = startOfDay(ref);
  let next = new Date(r.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (next < r) {
    next = new Date(r.getFullYear() + 1, anchor.getMonth(), anchor.getDate());
  }
  return next;
}

export function daysFromTo(from: Date, to: Date): number {
  const a = startOfDay(from).getTime();
  const b = startOfDay(to).getTime();
  return Math.round((b - a) / 86400000);
}

export type MilestoneKind = 'student_birthday' | 'staff_birthday' | 'establishment';

export interface DashboardMilestone {
  kind: MilestoneKind;
  title: string;
  detail: string;
  on: Date;
  daysUntil: number;
}

export interface MilestoneSources {
  instituteName: string;
  establishedOn: string;
  students: { full_name: string; class_name: string; date_of_birth: string }[];
  faculty: { name: string; date_of_birth: string }[];
}

const HORIZON_DAYS = 90;

export function buildUpcomingMilestones(
  src: MilestoneSources,
  today = new Date()
): DashboardMilestone[] {
  const t0 = startOfDay(today);
  const out: DashboardMilestone[] = [];

  const est = parseCalendarDate(src.establishedOn);
  if (est) {
    const on = nextAnnualOccurrence(est, t0);
    const daysUntil = daysFromTo(t0, on);
    if (daysUntil <= HORIZON_DAYS) {
      const years = on.getFullYear() - est.getFullYear();
      const label = src.instituteName.trim() || 'School';
      const ageBit =
        years > 1 ? `${years} years` : years === 1 ? '1 year' : '';
      out.push({
        kind: 'establishment',
        title: 'School establishment day',
        detail: ageBit ? `${label} · ${ageBit}` : label,
        on,
        daysUntil,
      });
    }
  }

  for (const s of src.students) {
    const b = parseCalendarDate(s.date_of_birth);
    if (!b) continue;
    const on = nextAnnualOccurrence(b, t0);
    const daysUntil = daysFromTo(t0, on);
    if (daysUntil > HORIZON_DAYS) continue;
    out.push({
      kind: 'student_birthday',
      title: s.full_name,
      detail: `${s.class_name} · turns ${ageTurning(b, on)}`,
      on,
      daysUntil,
    });
  }

  for (const f of src.faculty) {
    const b = parseCalendarDate(f.date_of_birth);
    if (!b) continue;
    const on = nextAnnualOccurrence(b, t0);
    const daysUntil = daysFromTo(t0, on);
    if (daysUntil > HORIZON_DAYS) continue;
    out.push({
      kind: 'staff_birthday',
      title: f.name,
      detail: `Staff · turns ${ageTurning(b, on)}`,
      on,
      daysUntil,
    });
  }

  out.sort((a, b) => a.daysUntil - b.daysUntil || a.on.getTime() - b.on.getTime());
  return out.slice(0, 16);
}

function ageTurning(birth: Date, birthdayThisYear: Date): number {
  return birthdayThisYear.getFullYear() - birth.getFullYear();
}
