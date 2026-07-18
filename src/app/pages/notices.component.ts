import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, catchError, of, switchMap } from 'rxjs';
import { ApiService, Notice, NoticePayload } from '../core/api.service';

@Component({
  selector: 'app-notices',
  standalone: true,
  imports: [AsyncPipe, DatePipe, FormsModule],
  templateUrl: './notices.component.html',
  styleUrl: './pages-shared.scss',
})
export class NoticesComponent {
  private readonly api = inject(ApiService);
  private readonly classFilter$ = new BehaviorSubject<void>(undefined);

  title = '';
  body = '';
  audience = 'all';
  pinned = false;
  editingId: number | null = null;
  saving = false;
  error = '';

  readonly notices$ = this.classFilter$.pipe(
    switchMap(() =>
      this.api.listNotices().pipe(catchError(() => of<Notice[]>([])))
    )
  );

  private payload(): NoticePayload {
    return {
      title: this.title.trim(),
      body: this.body,
      audience: this.audience.trim() || 'all',
      pinned: this.pinned,
    };
  }

  clearForm(): void {
    this.title = '';
    this.body = '';
    this.audience = 'all';
    this.pinned = false;
    this.editingId = null;
    this.error = '';
  }

  edit(n: Notice): void {
    this.editingId = n.id;
    this.title = n.title;
    this.body = n.body;
    this.audience = n.audience;
    this.pinned = n.pinned;
    this.error = '';
  }

  save(): void {
    if (!this.title.trim()) {
      this.error = 'Title is required.';
      return;
    }
    this.error = '';
    this.saving = true;
    const p = this.payload();
    const req =
      this.editingId != null
        ? this.api.updateNotice(this.editingId, p)
        : this.api.createNotice(p);
    req.subscribe({
      next: () => {
        this.saving = false;
        this.clearForm();
        this.classFilter$.next();
      },
      error: () => {
        this.saving = false;
        this.error = 'Save failed. Is the API running?';
      },
    });
  }

  remove(n: Notice): void {
    if (!confirm(`Delete notice “${n.title}”?`)) return;
    this.api.deleteNotice(n.id).subscribe({
      next: () => {
        if (this.editingId === n.id) this.clearForm();
        this.classFilter$.next();
      },
    });
  }
}
