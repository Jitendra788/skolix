import { tryParseStructured } from '../homework/homework-structured.model';

/** Normalize Quill HTML: treat empty editor output as ''. */
export function normalizeHomeworkDescription(html: string | null | undefined): string {
  const s = (html ?? '').trim();
  if (!s) return '';
  if (/^<p><br\s*\/?><\/p>$/i.test(s)) return '';
  if (/^<p>\s*<\/p>$/i.test(s)) return '';
  if (/^<div><br\s*\/?><\/div>$/i.test(s)) return '';
  return s;
}

export function isHomeworkDescriptionEmpty(html: string | null | undefined): boolean {
  const structured = tryParseStructured(html);
  if (structured) {
    return !(
      structured.title?.trim() ||
      normalizeHomeworkDescription(structured.instructions) ||
      structured.questions?.some((q) => q.trim()) ||
      structured.submissionNotes?.trim()
    );
  }
  return normalizeHomeworkDescription(html) === '';
}

/** Strip tags for dashboard snippets (single-line preview). */
export function homeworkDescriptionPreview(html: string | null | undefined, max: number): string {
  const raw = html ?? '';
  const structured = tryParseStructured(raw);
  if (structured) {
    const strip = (s: string | undefined) =>
      (s ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const parts = [
      strip(structured.title),
      strip(normalizeHomeworkDescription(structured.instructions) || structured.instructions),
      ...structured.questions.map((q) => strip(q)),
      strip(structured.submissionNotes),
    ].filter(Boolean);
    const plain = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (!plain) return '';
    return plain.length <= max ? plain : `${plain.slice(0, max).trim()}…`;
  }
  const plain = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  return plain.length <= max ? plain : `${plain.slice(0, max).trim()}…`;
}
