import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, of, take } from 'rxjs';
import { ApiService, Student } from '../core/api.service';

export type LetterTemplateId = 'classic' | 'modern' | 'compact';

interface LetterTemplateOption {
  id: LetterTemplateId;
  name: string;
  description: string;
}

@Component({
  selector: 'app-student-admission-letter',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './student-admission-letter.component.html',
  styleUrls: ['./pages-shared.scss', './student-admission-letter.component.scss'],
})
export class StudentAdmissionLetterComponent implements OnInit {
  private readonly api = inject(ApiService);

  @ViewChild('pdfRoot', { read: ElementRef }) pdfRoot?: ElementRef<HTMLElement>;

  readonly templateOptions: LetterTemplateOption[] = [
    {
      id: 'classic',
      name: 'Classic',
      description: 'Formal letter layout.',
    },
    {
      id: 'modern',
      name: 'Executive card',
      description: 'School letterhead, photo and structured details.',
    },
    {
      id: 'compact',
      name: 'Formal compact',
      description: 'Minimal framed summary for records.',
    },
  ];

  students: Student[] = [];
  studentSearch = '';
  loading = false;
  loadError = '';
  selectedStudentId: number | null = null;
  selectedTemplate: LetterTemplateId = 'modern';
  instituteName = '';
  pdfExporting = false;
  pdfError = '';

  ngOnInit(): void {
    this.api
      .getInstituteProfile()
      .pipe(take(1), catchError(() => of(null)))
      .subscribe((p) => {
        const n = p?.name?.trim();
        if (n) this.instituteName = n;
      });
    this.loadStudents();
  }

  loadStudents(): void {
    this.loading = true;
    this.loadError = '';
    this.api
      .listStudents({ limit: 1000 })
      .pipe(catchError(() => of<Student[]>([])))
      .subscribe((rows) => {
        this.loading = false;
        if (rows.length === 0) {
          this.loadError =
            'No students found yet. Add students first, then generate letters.';
          this.students = [];
          this.selectedStudentId = null;
          return;
        }
        this.students = [...rows].sort((a, b) =>
          (a.full_name || '').localeCompare(b.full_name || ''),
        );
        this.syncSelectionToFilter();
      });
  }

  get filteredStudents(): Student[] {
    const q = this.studentSearch.trim().toLowerCase();
    if (!q) return this.students;
    return this.students.filter((s) => {
      const name = (s.full_name || '').toLowerCase();
      const adm = (s.admission_no || '').toLowerCase();
      return name.includes(q) || adm.includes(q);
    });
  }

  onSearchChange(): void {
    this.syncSelectionToFilter();
  }

  private syncSelectionToFilter(): void {
    const list = this.filteredStudents;
    if (list.length === 0) {
      this.selectedStudentId = null;
      return;
    }
    if (
      this.selectedStudentId == null ||
      !list.some((s) => s.id === this.selectedStudentId)
    ) {
      this.selectedStudentId = list[0]!.id;
    }
  }

  get selectedStudent(): Student | null {
    if (this.selectedStudentId == null) return null;
    return this.students.find((s) => s.id === this.selectedStudentId) || null;
  }

  selectTemplate(id: LetterTemplateId): void {
    this.selectedTemplate = id;
    this.pdfError = '';
  }

  letterDateDisplay(): string {
    return new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  admissionDateDisplay(s: Student): string {
    const extras = (s.admission_extras || {}) as Record<string, unknown>;
    const raw = String(extras['date_of_admission'] || '').trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (!m) return raw || '—';
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const s0 = d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    return s0.replace(/^(\d{2}) (\w+) (\d{4})$/, '$1 $2, $3');
  }

  studentClassLine(s: Student): string {
    const cls = (s.class_name || '').trim();
    const sec = (s.section || '').trim();
    return sec ? `${cls} / ${sec}` : cls || '—';
  }

  private extraStrFromExtras(s: Student, key: string): string {
    const ex = (s.admission_extras || {}) as Record<string, unknown>;
    const v = ex[key];
    if (v == null) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
  }

  /** From admission extras or combined parent_name (father segment). */
  studentFatherName(s: Student): string {
    const fromEx = this.extraStrFromExtras(s, 'father_name');
    if (fromEx) return fromEx;
    const pn = (s.parent_name || '').trim();
    if (pn.includes(' & ')) {
      const first = pn.split(' & ')[0]?.trim();
      if (first) return first;
    }
    return pn || '—';
  }

  studentBloodGroup(s: Student): string {
    const t = this.extraStrFromExtras(s, 'blood_group');
    return t || '—';
  }

  /**
   * Uses emergency_contact in extras when set; otherwise parent phone, then father/mother mobile.
   */
  studentEmergencyContact(s: Student): string {
    const em = this.extraStrFromExtras(s, 'emergency_contact');
    if (em) return em;
    const parent = (s.parent_phone || '').trim();
    if (parent) return parent;
    const fm = this.extraStrFromExtras(s, 'father_mobile');
    if (fm) return fm;
    const mm = this.extraStrFromExtras(s, 'mother_mobile');
    return mm || '—';
  }

  studentPhotoUrl(s: Student | null): string | null {
    if (!s) return null;
    const ex = s.admission_extras || {};
    const p = (ex as Record<string, unknown>)['photo_data'];
    return typeof p === 'string' && p.startsWith('data:') ? p : null;
  }

  confirmationInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return (parts[0]![0] || '?').toUpperCase();
    const a = parts[0]![0] || '';
    const b = parts[parts.length - 1]![0] || '';
    return `${a}${b}`.toUpperCase();
  }

  async downloadPdf(): Promise<void> {
    const el = this.pdfRoot?.nativeElement;
    const s = this.selectedStudent;
    if (!el || !s) return;
    this.pdfError = '';
    this.pdfExporting = true;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const canvas = await html2canvas(el, {
        scale: 2,
        logging: false,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const maxW = pageW - margin * 2;
      const maxH = pageH - margin * 2;
      const imgProps = pdf.getImageProperties(imgData);
      const ratio = Math.min(
        maxW / imgProps.width,
        maxH / imgProps.height,
      );
      const w = imgProps.width * ratio;
      const h = imgProps.height * ratio;
      const x = margin + (maxW - w) / 2;
      const y = margin + (maxH - h) / 2;
      pdf.addImage(imgData, 'PNG', x, y, w, h);
      const adm = (s.admission_no || 'student').replace(/[^\w-]+/g, '_');
      pdf.save(`admission-letter-${adm}.pdf`);
    } catch {
      this.pdfError =
        'Could not create PDF. Try allowing downloads, or use Print and choose Save as PDF.';
    } finally {
      this.pdfExporting = false;
    }
  }

  printSelectedLetter(): void {
    const s = this.selectedStudent;
    if (!s) return;
    this.pdfError = '';
    const html = this.buildPrintHtml(s, this.selectedTemplate);
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.title = 'Print';
    iframe.style.cssText =
      'position:fixed;inset:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(iframe);
    const w = iframe.contentWindow;
    const d = iframe.contentDocument;
    if (!w || !d) {
      iframe.remove();
      this.pdfError = 'Print could not start. Use Download PDF instead.';
      return;
    }
    d.open();
    d.write(html);
    d.close();
    const runPrint = (): void => {
      try {
        w.focus();
        w.print();
      } finally {
        setTimeout(() => iframe.remove(), 500);
      }
    };
    setTimeout(runPrint, 50);
  }

  private esc(v: string): string {
    return v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private buildPrintHtml(s: Student, template: LetterTemplateId): string {
    const today = this.letterDateDisplay();
    const studentName = this.esc((s.full_name || '').trim() || '—');
    const admissionNo = this.esc((s.admission_no || '').trim() || '—');
    const classLine = this.esc(this.studentClassLine(s));
    const admissionDate = this.esc(this.admissionDateDisplay(s));
    const school = this.esc(this.instituteName || 'School');
    const blood = this.esc(this.studentBloodGroup(s));
    const father = this.esc(this.studentFatherName(s));
    const emergency = this.esc(this.studentEmergencyContact(s));

    const common = `
      <p><strong>Student:</strong> ${studentName}</p>
      <p><strong>Registration / ID:</strong> ${admissionNo}</p>
      <p><strong>Class:</strong> ${classLine}</p>
      <p><strong>Admission date:</strong> ${admissionDate}</p>
      <p><strong>Blood group:</strong> ${blood}</p>
      <p><strong>Father name:</strong> ${father}</p>
      <p><strong>Emergency contact:</strong> ${emergency}</p>
    `;

    if (template === 'modern') {
      return `<!doctype html>
<html><head><meta charset="utf-8"><title>Admission Letter</title>
<style>
*{box-sizing:border-box} body{font-family:Segoe UI,Arial,sans-serif;margin:24px;background:#f8fafc;color:#0f172a}
.card{max-width:760px;margin:0 auto;border:1px solid #cbd5e1;border-radius:16px;overflow:hidden;background:#fff}
.head{padding:20px 24px;background:linear-gradient(135deg,#1d4ed8,#4338ca);color:#fff}
.body{padding:22px 24px}
p{margin:0 0 10px;line-height:1.5}
.note{margin-top:16px;padding:12px;border-radius:10px;background:#eef2ff}
</style></head><body>
<div class="card">
<div class="head"><h2 style="margin:0">${school}</h2><div>Admission · ${this.esc(
        today,
      )}</div></div>
<div class="body">
${common}
<p class="note">Admission confirmed for the current academic session.</p>
</div></div>
</body></html>`;
    }

    if (template === 'compact') {
      return `<!doctype html>
<html><head><meta charset="utf-8"><title>Admission Letter</title>
<style>
body{font-family:Arial,sans-serif;margin:18px;color:#111827}
h2{margin:0 0 8px} p{margin:4px 0;font-size:14px}
.line{margin:10px 0;border-top:1px solid #d1d5db}
</style></head><body>
<h2>${school}</h2>
<p>Date: ${this.esc(today)}</p>
<div class="line"></div>
${common}
<div class="line"></div>
<p>Verified by school administration.</p>
</body></html>`;
    }

    return `<!doctype html>
<html><head><meta charset="utf-8"><title>Admission Letter</title>
<style>
body{font-family:'Times New Roman',serif;margin:28px;color:#111827;line-height:1.6}
h1{margin:0 0 4px;font-size:24px} h2{margin:0 0 18px;font-size:18px}
p{margin:0 0 10px}
</style></head><body>
<h1>${school}</h1>
<h2>Admission Letter · ${this.esc(today)}</h2>
<p>Dear Parent / Guardian,</p>
<p>This is to confirm the admission of the following student:</p>
${common}
<p>The student is enrolled and eligible to attend classes from the admission date noted above.</p>
<p style="margin-top:28px">Yours faithfully,<br><br>School Administration</p>
</body></html>`;
  }
}
