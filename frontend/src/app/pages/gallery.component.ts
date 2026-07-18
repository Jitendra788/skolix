import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, catchError, of, switchMap } from 'rxjs';
import { ApiService, GalleryImage, GalleryPayload } from '../core/api.service';

@Component({
  selector: 'app-gallery',
  standalone: true,
  imports: [AsyncPipe, FormsModule],
  templateUrl: './gallery.component.html',
  styleUrl: './gallery.component.scss',
})
export class GalleryComponent {
  private readonly api = inject(ApiService);
  private readonly refresh$ = new BehaviorSubject<void>(undefined);

  title = '';
  event_name = '';
  image_url = '';
  taken_on = '';
  editingId: number | null = null;
  saving = false;
  error = '';

  readonly images$ = this.refresh$.pipe(
    switchMap(() =>
      this.api.listGallery().pipe(catchError(() => of<GalleryImage[]>([])))
    )
  );

  private payload(): GalleryPayload {
    const d = this.taken_on.trim();
    return {
      title: this.title.trim(),
      event_name: this.event_name.trim(),
      image_url: this.image_url.trim(),
      taken_on: d ? d : null,
    };
  }

  clearForm(): void {
    this.title = '';
    this.event_name = '';
    this.image_url = '';
    this.taken_on = '';
    this.editingId = null;
    this.error = '';
  }

  edit(g: GalleryImage): void {
    this.editingId = g.id;
    this.title = g.title;
    this.event_name = g.event_name;
    this.image_url = g.image_url;
    this.taken_on = g.taken_on ? g.taken_on.slice(0, 10) : '';
    this.error = '';
  }

  save(): void {
    if (!this.title.trim() || !this.image_url.trim()) {
      this.error = 'Title and image URL are required.';
      return;
    }
    this.error = '';
    this.saving = true;
    const body = this.payload();
    const req =
      this.editingId != null
        ? this.api.updateGalleryImage(this.editingId, body)
        : this.api.createGalleryImage(body);
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

  remove(g: GalleryImage): void {
    if (!confirm(`Remove “${g.title}” from gallery?`)) return;
    this.api.deleteGalleryImage(g.id).subscribe({
      next: () => {
        if (this.editingId === g.id) this.clearForm();
        this.refresh$.next();
      },
    });
  }
}
