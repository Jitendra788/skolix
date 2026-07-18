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
import { SchoolRefService } from '../core/school-ref.service';

export type IdCardTemplateId =
  | 't01'
  | 't02'
  | 't03'
  | 't04'
  | 't05'
  | 't06'
  | 't07'
  | 't08'
  | 't09'
  | 't10'
  | 't11'
  | 't12'
  | 't13'
  | 't14'
  | 't15'
  | 'v01'
  | 'v02'
  | 'v03'
  | 'v04'
  | 'v05'
  | 'v06'
  | 'v07'
  | 'v08'
  | 'v09'
  | 'v10'
  | 'v11'
  | 'v12'
  | 'v13'
  | 'v14'
  | 'v15';

export interface IdCardTemplateOption {
  id: IdCardTemplateId;
  name: string;
  hint: string;
}

@Component({
  selector: 'app-student-id-card',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './student-id-card.component.html',
  styleUrls: ['./pages-shared.scss', './student-id-card.component.scss'],
})
export class StudentIdCardComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly schoolRef = inject(SchoolRefService);

  @ViewChild('pdfRoot', { read: ElementRef }) pdfRoot?: ElementRef<HTMLElement>;

  readonly landscapeTemplateOptions: IdCardTemplateOption[] = [
    { id: 't01', name: 'Navy band', hint: 'Top bar, clean white body' },
    { id: 't02', name: 'Crimson edge', hint: 'Left accent stripe' },
    { id: 't03', name: 'Ocean gradient', hint: 'Soft blue–teal header' },
    { id: 't04', name: 'Royal purple', hint: 'Bold header, gold line' },
    { id: 't05', name: 'Slate dark', hint: 'Dark frame, light text' },
    { id: 't06', name: 'Forest', hint: 'Green header, cream card' },
    { id: 't07', name: 'Sunrise', hint: 'Warm orange accent' },
    { id: 't08', name: 'Minimal line', hint: 'Thin borders, lots of white' },
    { id: 't09', name: 'Badge round', hint: 'Circular photo, ring border' },
    { id: 't10', name: 'Split duo', hint: 'Two-tone background' },
    { id: 't11', name: 'Soft pastel', hint: 'Rounded, lilac tint' },
    { id: 't12', name: 'Charcoal pro', hint: 'Corporate grey + cyan' },
    { id: 't13', name: 'Emerald card', hint: 'Deep green band' },
    { id: 't14', name: 'Rose formal', hint: 'Burgundy header' },
    { id: 't15', name: 'Mono stamp', hint: 'Black & white official' },
  ];

  readonly verticalTemplateOptions: IdCardTemplateOption[] = [
    { id: 'v01', name: 'Navy pillar', hint: 'Bold header, centered photo' },
    { id: 'v02', name: 'Crimson spine', hint: 'Left accent rail' },
    { id: 'v03', name: 'Ocean stack', hint: 'Gradient cap, teal footer' },
    { id: 'v04', name: 'Royal crest', hint: 'Purple banner, soft body' },
    { id: 'v05', name: 'Midnight slab', hint: 'Dark card, neon accent' },
    { id: 'v06', name: 'Forest totem', hint: 'Green band, cream panel' },
    { id: 'v07', name: 'Sunrise column', hint: 'Warm gradient top' },
    { id: 'v08', name: 'Clean portrait', hint: 'Outline frame, airy' },
    { id: 'v09', name: 'Halo photo', hint: 'Round portrait, ring glow' },
    { id: 'v10', name: 'Split vertical', hint: 'Two-tone top / bottom' },
    { id: 'v11', name: 'Lilac panel', hint: 'Soft purple wash' },
    { id: 'v12', name: 'Graphite edge', hint: 'Cyan underline bar' },
    { id: 'v13', name: 'Jade strip', hint: 'Deep green + mint footer' },
    { id: 'v14', name: 'Wine ribbon', hint: 'Burgundy + blush body' },
    { id: 'v15', name: 'Archival mono', hint: 'High-contrast formal' },
  ];

  students: Student[] = [];
  studentSearch = '';
  loading = false;
  loadError = '';
  selectedStudentId: number | null = null;
  /** Default to portrait so the preview shows the vertical details panel without an extra click. */
  selectedTemplate: IdCardTemplateId = 'v01';
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

  idcRootClass(): string {
    const id = this.selectedTemplate;
    if (id.startsWith('v')) {
      return `idc idc--vertical idc--${id}`;
    }
    return `idc idc--${id}`;
  }

  isVerticalTemplate(): boolean {
    return this.selectedTemplate.startsWith('v');
  }

  selectTemplate(id: IdCardTemplateId): void {
    this.selectedTemplate = id;
    this.pdfError = '';
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
            'No students found yet. Add students first, then create ID cards.';
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

  issueDateDisplay(): string {
    return new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  studentClassLine(s: Student): string {
    const cls = (s.class_name || '').trim();
    const sec = (s.section || '').trim();
    return sec ? `${cls} · ${sec}` : cls || '—';
  }

  private extraStr(s: Student, key: string): string {
    const ex = (s.admission_extras || {}) as Record<string, unknown>;
    const v = ex[key];
    if (v == null) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return '';
  }

  studentBloodGroup(s: Student): string {
    const t = this.extraStr(s, 'blood_group');
    return t || '—';
  }

  /**
   * Uses emergency_contact in extras when set; otherwise parent phone, then father/mother mobile.
   */
  studentEmergencyContact(s: Student): string {
    const em = this.extraStr(s, 'emergency_contact');
    if (em) return em;
    const parent = (s.parent_phone || '').trim();
    if (parent) return parent;
    const fm = this.extraStr(s, 'father_mobile');
    if (fm) return fm;
    const mm = this.extraStr(s, 'mother_mobile');
    return mm || '—';
  }

  studentPhotoUrl(s: Student | null): string | null {
    if (!s) return null;
    const ex = s.admission_extras || {};
    const p = (ex as Record<string, unknown>)['photo_data'];
    return typeof p === 'string' && p.startsWith('data:') ? p : null;
  }

  initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return (parts[0]![0] || '?').toUpperCase();
    const a = parts[0]![0] || '';
    const b = parts[parts.length - 1]![0] || '';
    return `${a}${b}`.toUpperCase();
  }

  academicYearShort(): string {
    return (this.schoolRef.defaultAcademicYear() || '').trim() || '—';
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
      const vertical = this.isVerticalTemplate();
      const pdf = new jsPDF({
        orientation: vertical ? 'p' : 'l',
        unit: 'mm',
        format: vertical ? [54, 86] : [86, 54],
      });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgProps = pdf.getImageProperties(imgData);
      const ratio = Math.min(pageW / imgProps.width, pageH / imgProps.height);
      const w = imgProps.width * ratio;
      const h = imgProps.height * ratio;
      const x = (pageW - w) / 2;
      const y = (pageH - h) / 2;
      pdf.addImage(imgData, 'PNG', x, y, w, h);
      const adm = (s.admission_no || 'student').replace(/[^\w-]+/g, '_');
      pdf.save(`student-id-${adm}.pdf`);
    } catch {
      this.pdfError =
        'Could not create PDF. Try again or check browser download settings.';
    } finally {
      this.pdfExporting = false;
    }
  }

  /** Prints the card as rendered (image) so it matches the template exactly. */
  async printIdCard(): Promise<void> {
    const el = this.pdfRoot?.nativeElement;
    if (!el || !this.selectedStudent) return;
    this.pdfError = '';
    this.pdfExporting = true;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(el, {
        scale: 2,
        logging: false,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const iframe = document.createElement('iframe');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.title = 'Print ID card';
      iframe.style.cssText =
        'position:fixed;inset:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
      document.body.appendChild(iframe);
      const w = iframe.contentWindow;
      const d = iframe.contentDocument;
      if (!w || !d) {
        iframe.remove();
        this.pdfError = 'Print could not start. Try Download PDF.';
        return;
      }
      d.open();
      d.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>ID card</title>
 <style>
          * { box-sizing: border-box; }
          html, body { margin: 0; height: 100%; }
          body {
            display: flex; align-items: center; justify-content: center;
            min-height: 100vh;
            background: #fff;
          }
          img { max-width: 100%; height: auto; display: block; }
 @media print {
            body { min-height: auto; }
            img { max-height: 100vh; }
          }
        </style></head><body>
 <img src="${dataUrl}" alt="" />
        </body></html>`);
      d.close();
      const runPrint = (): void => {
        try {
          w.focus();
          w.print();
        } finally {
          setTimeout(() => iframe.remove(), 500);
        }
      };
      setTimeout(runPrint, 100);
    } catch {
      this.pdfError = 'Could not print. Try Download PDF instead.';
    } finally {
      this.pdfExporting = false;
    }
  }
}
