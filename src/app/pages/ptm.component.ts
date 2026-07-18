import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  of,
  switchMap,
} from 'rxjs';
import { ApiService, PTMUpdate, PTMPayload } from '../core/api.service';
import { SchoolRefService } from '../core/school-ref.service';

@Component({
  selector: 'app-ptm',
  standalone: true,
  imports: [AsyncPipe, DatePipe, FormsModule],
  templateUrl: './ptm.component.html',
  styleUrl: './pages-shared.scss',
})
export class PtmComponent {
  private readonly api = inject(ApiService);
  readonly schoolRef = inject(SchoolRefService);
  private readonly classFilter$ = new BehaviorSubject<string>('');
  private readonly refresh$ = new BehaviorSubject<void>(undefined);
  filterInput = '';

  class_name = '';
  scheduled_local = '';
  venue = '';
  agenda = '';
  editingId: number | null = null;
  saving = false;
  error = '';

  readonly items$ = combineLatest([this.classFilter$, this.refresh$]).pipe(
    switchMap(([c]) =>
      this.api.listPTM(c || undefined).pipe(catchError(() => of<PTMUpdate[]>([])))
    )
  );

  applyFilter(): void {
    this.classFilter$.next(this.filterInput.trim());
  }

  private isoToLocal(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  private localToIso(local: string): string {
    const t = Date.parse(local);
    if (Number.isNaN(t)) return new Date().toISOString();
    return new Date(t).toISOString();
  }

  private payload(): PTMPayload {
    return {
      class_name: this.class_name.trim(),
      scheduled_at: this.localToIso(this.scheduled_local),
      venue: this.venue.trim(),
      agenda: this.agenda,
    };
  }

  clearForm(): void {
    this.class_name = '';
    this.scheduled_local = '';
    this.venue = '';
    this.agenda = '';
    this.editingId = null;
    this.error = '';
  }

  edit(r: PTMUpdate): void {
    this.editingId = r.id;
    this.class_name = r.class_name;
    this.scheduled_local = this.isoToLocal(r.scheduled_at);
    this.venue = r.venue;
    this.agenda = r.agenda;
    this.error = '';
  }

  save(): void {
    if (!this.class_name.trim() || !this.scheduled_local) {
      this.error = 'Class and date/time are required.';
      return;
    }
    this.error = '';
    this.saving = true;
    const body = this.payload();
    const req =
      this.editingId != null
        ? this.api.updatePTM(this.editingId, body)
        : this.api.createPTM(body);
    req.subscribe({
      next: () => {
        this.saving = false;
        this.clearForm();
        this.refresh$.next();
      },
      error: () => {
        this.saving = false;
        this.error = 'Save failed.';
      },
    });
  }

  remove(r: PTMUpdate): void {
    if (!confirm(`Delete PTM for ${r.class_name}?`)) return;
    this.api.deletePTM(r.id).subscribe({
      next: () => {
        if (this.editingId === r.id) this.clearForm();
        this.refresh$.next();
      },
    });
  }
}
