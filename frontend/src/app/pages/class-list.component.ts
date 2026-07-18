import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, OnInit, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { DEFAULT_CLASS_SECTION_PRESETS } from '../core/section-options';
import { SchoolRefService } from '../core/school-ref.service';
import {
  ApiService,
  SchoolClassRow,
  Student,
} from '../core/api.service';

interface ClassRosterGenderStats {
  total: number;
  boys: number;
  girls: number;
  na: number;
}

@Component({
  selector: 'app-class-list',
  standalone: true,
  imports: [RouterLink, DragDropModule],
  templateUrl: './class-list.component.html',
  styleUrls: ['./pages-shared.scss', './class-list.component.scss'],
})
export class ClassListComponent implements OnInit {
  readonly api = inject(ApiService);
  readonly schoolRef = inject(SchoolRefService);

  readonly sectionPresets = [...DEFAULT_CLASS_SECTION_PRESETS];

  private readonly statsByClass = new Map<string, ClassRosterGenderStats>();

  /** Display order; kept in sync with server via `SchoolRefService.classes` except during drag. */
  orderedClasses: SchoolClassRow[] = [];

  sectionEditorId: number | null = null;
  sectionEditorSet = new Set<string>();
  sectionBusy = false;
  sectionErr = '';

  constructor() {
    effect(() => {
      const raw = this.schoolRef.classes();
      this.orderedClasses = [...raw].sort(
        (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)
      );
    });
  }

  ngOnInit(): void {
    this.reloadStudentStats();
  }

  get dragLocked(): boolean {
    return this.sectionEditorId !== null;
  }

  statsFor(className: string): ClassRosterGenderStats {
    return (
      this.statsByClass.get(className.trim()) ?? {
        total: 0,
        boys: 0,
        girls: 0,
        na: 0,
      }
    );
  }

  pct(part: number, total: number): number {
    if (total <= 0) return 0;
    return Math.round((100 * part) / total);
  }

  ringDash(pct: number): string {
    const p = Math.min(100, Math.max(0, Math.round(pct)));
    return `${p} ${100 - p}`;
  }

  onClassDrop(event: CdkDragDrop<SchoolClassRow[]>): void {
    if (this.dragLocked) return;
    if (event.previousIndex === event.currentIndex) return;
    moveItemInArray(this.orderedClasses, event.previousIndex, event.currentIndex);
    const ids = this.orderedClasses.map((c) => c.id);
    this.api
      .reorderSchoolClasses(ids)
      .pipe(catchError(() => of(null)))
      .subscribe(() => {
        this.schoolRef.loadAll();
      });
  }

  private reloadStudentStats(): void {
    this.api
      .listStudents()
      .pipe(catchError(() => of<Student[]>([])))
      .subscribe((list) => {
        this.statsByClass.clear();
        for (const s of list) {
          const cn = (s.class_name || '').trim();
          if (!cn) continue;
          const cur =
            this.statsByClass.get(cn) ?? { total: 0, boys: 0, girls: 0, na: 0 };
          cur.total += 1;
          const b = this.genderBucket(s.gender);
          if (b === 'boys') cur.boys += 1;
          else if (b === 'girls') cur.girls += 1;
          else cur.na += 1;
          this.statsByClass.set(cn, cur);
        }
      });
  }

  private genderBucket(g: string | undefined): 'boys' | 'girls' | 'na' {
    const x = (g || '').trim().toLowerCase();
    if (['m', 'male', 'boy', 'boys'].includes(x)) return 'boys';
    if (['f', 'female', 'girl', 'girls'].includes(x)) return 'girls';
    return 'na';
  }

  openSectionEditor(c: SchoolClassRow): void {
    this.closeSectionEditor();
    this.sectionEditorId = c.id;
    this.sectionEditorSet = new Set((c.sections || []).map((s) => s.trim().toUpperCase()).filter(Boolean));
    this.sectionErr = '';
  }

  closeSectionEditor(): void {
    this.sectionEditorId = null;
    this.sectionEditorSet.clear();
    this.sectionErr = '';
  }

  toggleEditorSection(letter: string): void {
    const u = letter.toUpperCase();
    if (this.sectionEditorSet.has(u)) {
      this.sectionEditorSet.delete(u);
    } else {
      this.sectionEditorSet.add(u);
    }
  }

  private orderedSectionCodes(from: Set<string>): string[] {
    const preset = this.sectionPresets;
    const presetSet = new Set<string>(preset);
    const chosen = [...from].map((x) => x.toUpperCase()).filter(Boolean);
    const ordered = preset.filter((p) => chosen.includes(p));
    const extra = chosen.filter((x) => !presetSet.has(x)).sort();
    return [...ordered, ...extra];
  }

  saveSections(): void {
    if (this.sectionEditorId == null) return;
    this.sectionErr = '';
    this.sectionBusy = true;
    const codes = this.orderedSectionCodes(this.sectionEditorSet);
    this.api
      .putSchoolClassSections(this.sectionEditorId, { section_codes: codes })
      .pipe(catchError(() => of(null)))
      .subscribe({
        next: (row) => {
          this.sectionBusy = false;
          if (!row) {
            this.sectionErr = 'Save failed. Remove duplicates or try again.';
            return;
          }
          this.closeSectionEditor();
          this.reloadStudentStats();
          this.schoolRef.loadAll();
        },
        error: () => {
          this.sectionBusy = false;
          this.sectionErr = 'Save failed.';
        },
      });
  }

  removeClass(c: SchoolClassRow): void {
    if (!confirm(`Delete class "${c.name}"?`)) return;
    this.api.deleteSchoolClass(c.id).subscribe({
      next: () => {
        this.closeSectionEditor();
        this.schoolRef.invalidateRosterCache();
        this.reloadStudentStats();
        this.schoolRef.loadAll();
      },
    });
  }
}
