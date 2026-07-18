import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, of, take } from 'rxjs';
import { DEFAULT_CLASS_SECTION_PRESETS } from '../core/section-options';
import { SchoolRefService } from '../core/school-ref.service';
import {
  ApiService,
  Faculty,
  SchoolClassPayload,
  SchoolClassRow,
} from '../core/api.service';

@Component({
  selector: 'app-class-form',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './class-form.component.html',
  styleUrls: ['./pages-shared.scss', './class-list.component.scss', './class-form.component.scss'],
})
export class ClassFormComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly schoolRef = inject(SchoolRefService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly sectionPresets = [...DEFAULT_CLASS_SECTION_PRESETS];

  faculty: Faculty[] = [];
  isCreate = true;
  editingClass: SchoolClassRow | null = null;

  className = '';
  monthlyTuition = '';
  classTeacher = '';
  classBusy = false;
  classErr = '';
  newClassSections = new Set<string>();

  get formTitle(): string {
    return this.isCreate ? 'Add New Class' : 'Edit class';
  }

  /** Aligns with sidebar label for the create route. */
  get pageH1(): string {
    return this.isCreate ? 'New Class' : 'Edit class';
  }

  ngOnInit(): void {
    this.api
      .listFaculty()
      .pipe(catchError(() => of<Faculty[]>([])))
      .subscribe((list) => {
        this.faculty = [...list].sort((a, b) => a.name.localeCompare(b.name));
        this.applyRoute();
      });
  }

  private applyRoute(): void {
    const idStr = this.route.snapshot.paramMap.get('id');
    this.isCreate = idStr == null;
    if (this.isCreate) {
      this.resetForm();
      return;
    }
    const id = +(idStr as string);
    if (!Number.isFinite(id) || id <= 0) {
      void this.router.navigate(['/classes/list']);
      return;
    }
    const fromCache = this.schoolRef.classes().find((c) => c.id === id);
    if (fromCache) {
      this.populateEdit(fromCache);
      return;
    }
    this.api
      .listSchoolClasses()
      .pipe(take(1), catchError(() => of<SchoolClassRow[]>([])))
      .subscribe((list) => {
        const c = list.find((x) => x.id === id);
        if (!c) {
          void this.router.navigate(['/classes/list']);
          return;
        }
        this.populateEdit(c);
      });
  }

  private populateEdit(c: SchoolClassRow): void {
    this.editingClass = c;
    this.className = c.name;
    this.monthlyTuition = (c.monthly_tuition || '').trim();
    this.classTeacher = (c.class_teacher || '').trim();
    this.classErr = '';
    this.newClassSections.clear();
    if (this.classTeacher && !this.facultyNames.has(this.classTeacher)) {
      this.faculty = [
        ...this.faculty,
        {
          id: -1,
          name: this.classTeacher,
          designation: '',
          subject: '',
          class_assigned: '',
          phone: '',
          email: '',
          photo_url: '',
          photo_data: null,
          date_joining: '',
          monthly_salary: '',
          guardian_name: '',
          gender: '',
          experience: '',
          national_id: '',
          religion: '',
          education: '',
          blood_group: '',
          date_of_birth: '',
          home_address: '',
        },
      ];
    }
  }

  private get facultyNames(): Set<string> {
    return new Set(this.faculty.map((f) => f.name));
  }

  private resetForm(): void {
    this.editingClass = null;
    this.className = '';
    this.monthlyTuition = '';
    this.classTeacher = '';
    this.classErr = '';
    this.newClassSections.clear();
    this.faculty = this.faculty.filter((f) => f.id !== -1);
  }

  goBackToList(): void {
    void this.router.navigate(['/classes/list']);
  }

  toggleNewSection(letter: string): void {
    const u = letter.toUpperCase();
    if (this.newClassSections.has(u)) {
      this.newClassSections.delete(u);
    } else {
      this.newClassSections.add(u);
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

  saveClass(): void {
    const name = this.className.trim();
    if (!name) {
      this.classErr = 'Class name is required.';
      return;
    }
    if (this.isCreate) {
      if (!this.monthlyTuition.trim()) {
        this.classErr = 'Monthly tuition fees are required.';
        return;
      }
      if (!this.classTeacher.trim()) {
        this.classErr = 'Please select a class teacher.';
        return;
      }
    }
    this.classErr = '';
    this.classBusy = true;
    const body: SchoolClassPayload = {
      name,
      sort_order: this.editingClass?.sort_order ?? 0,
      monthly_tuition: this.monthlyTuition.trim(),
      class_teacher: this.classTeacher.trim(),
    };
    if (this.isCreate && this.newClassSections.size > 0) {
      body.initial_sections = this.orderedSectionCodes(this.newClassSections);
    }
    const req = this.editingClass
      ? this.api.updateSchoolClass(this.editingClass.id, body)
      : this.api.createSchoolClass(body);
    req.pipe(catchError(() => of(null))).subscribe({
      next: (row) => {
        this.classBusy = false;
        if (!row) {
          this.classErr = 'Save failed (duplicate class name?).';
          return;
        }
        this.schoolRef.invalidateRosterCache();
        this.schoolRef.loadAll();
        void this.router.navigate(['/classes/list']);
      },
      error: () => {
        this.classBusy = false;
        this.classErr = 'Save failed (duplicate class name?).';
      },
    });
  }
}
