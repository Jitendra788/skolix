import { Student } from './api.service';

export function extraStr(s: Student, key: string): string {
  const ex = s.admission_extras;
  if (!ex || typeof ex !== 'object') return '';
  const v = (ex as Record<string, unknown>)[key];
  if (v == null) return '';
  return String(v).trim();
}

export function admissionDateIso(s: Student): string {
  const v = extraStr(s, 'date_of_admission');
  return v;
}

export function admissionDateDisplay(s: Student): string {
  const iso = admissionDateIso(s);
  if (!iso) return '—';
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

export function dobDisplay(s: Student): string {
  const d = (s.date_of_birth || '').trim();
  if (!d) return '—';
  return d.length >= 10 ? d.slice(0, 10) : d;
}

export function ageFromStudent(s: Student): string {
  const raw = (s.date_of_birth || '').trim();
  if (!raw || raw.length < 10) return '—';
  const d = new Date(raw.slice(0, 10));
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
    age--;
  }
  return age >= 0 ? String(age) : '—';
}

export function fatherName(s: Student): string {
  return extraStr(s, 'father_name') || (s.parent_name || '').trim() || '—';
}

export function motherName(s: Student): string {
  return extraStr(s, 'mother_name') || '—';
}

export function discountFeeLabel(s: Student): string {
  const v = extraStr(s, 'discount_fee_percent');
  if (!v) return '—';
  if (v.includes('%')) return v;
  return `${v}%`;
}

export function classWithSection(s: Student): string {
  const c = (s.class_name || '').trim();
  const sec = (s.section || '').trim();
  if (!c) return '—';
  return sec ? `${c} ${sec}` : c;
}

export function genderLabel(s: Student): string {
  const g = (s.gender || '').trim();
  return g || '—';
}
