export const HOMEWORK_CONTENT_VERSION = 2 as const;

export type HomeworkAssignMode = 'whole_class' | 'section' | 'students';

export interface HomeworkStructuredContent {
  v: typeof HOMEWORK_CONTENT_VERSION;
  title: string;
  instructions: string;
  questions: string[];
  submissionNotes: string;
  assignMode: HomeworkAssignMode;
  assignSection: string;
  studentAdmissionNos: string;
}

export function tryParseStructured(raw: string | null | undefined): HomeworkStructuredContent | null {
  const s = (raw ?? '').trim();
  if (!s.startsWith('{')) return null;
  try {
    const o = JSON.parse(s) as Partial<HomeworkStructuredContent>;
    if (o?.v !== HOMEWORK_CONTENT_VERSION) return null;
    const mode = String(o.assignMode ?? 'whole_class');
    const assignMode: HomeworkAssignMode = ['whole_class', 'section', 'students'].includes(mode)
      ? (mode as HomeworkAssignMode)
      : 'whole_class';
    return {
      v: HOMEWORK_CONTENT_VERSION,
      title: String(o.title ?? ''),
      instructions: String(o.instructions ?? ''),
      questions: Array.isArray(o.questions) ? o.questions.map(String) : [],
      submissionNotes: String(o.submissionNotes ?? ''),
      assignMode,
      assignSection: String(o.assignSection ?? ''),
      studentAdmissionNos: String(o.studentAdmissionNos ?? ''),
    };
  } catch {
    return null;
  }
}

export function serializeStructuredContent(
  body: Omit<HomeworkStructuredContent, 'v'>,
): string {
  return JSON.stringify({
    v: HOMEWORK_CONTENT_VERSION,
    ...body,
  });
}
