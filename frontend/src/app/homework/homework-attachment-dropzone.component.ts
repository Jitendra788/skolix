import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';

@Component({
  selector: 'app-homework-attachment-dropzone',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      class="hz"
      [class.hz-active]="dragOver"
      [class.hz-disabled]="disabled"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDrop($event)"
      (click)="!disabled && fileInput.click()"
      role="button"
      tabindex="0"
      (keydown.enter)="!disabled && fileInput.click()"
      (keydown.space)="$event.preventDefault(); !disabled && fileInput.click()"
    >
      <input
        #fileInput
        type="file"
        class="hz-native"
        [accept]="accept"
        [disabled]="disabled"
        (change)="onPick($event)"
      />
      <div class="hz-inner">
        <span class="hz-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </span>
        <div class="hz-text">
          <strong>{{ fileName ? 'Replace file' : 'Drop file here or browse' }}</strong>
          <span>{{ hint }}</span>
        </div>
      </div>
    </div>

    @if (fileName && !error) {
      <div class="hz-preview">
        @if (previewUrl) {
          <img [src]="previewUrl" alt="" class="hz-thumb" />
        } @else {
          <span class="hz-doc" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </span>
        }
        <div class="hz-meta">
          <span class="hz-name" [title]="fileName">{{ fileName }}</span>
          <button
            type="button"
            class="hz-remove"
            [disabled]="disabled"
            (click)="clear($event); $event.stopPropagation()"
          >
            Remove
          </button>
        </div>
      </div>
    }
    @if (error) {
      <p class="hz-err">{{ error }}</p>
    }
  `,
  styles: [
    `
      .hz {
        border: 2px dashed var(--border-strong, #cbd5e1);
        border-radius: 14px;
        padding: 1.35rem 1rem;
        cursor: pointer;
        transition:
          border-color 0.15s ease,
          background 0.15s ease,
          box-shadow 0.15s ease;
        background: var(--bg-muted, #f8fafc);
      }
      .hz:hover:not(.hz-disabled) {
        border-color: var(--accent, #4f46e5);
        background: rgba(79, 70, 229, 0.04);
      }
      .hz-active {
        border-color: var(--accent, #4f46e5);
        box-shadow: 0 0 0 3px var(--accent-soft, rgba(79, 70, 229, 0.14));
        background: rgba(79, 70, 229, 0.06);
      }
      .hz-disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .hz-native {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
      }
      .hz-inner {
        display: flex;
        align-items: center;
        gap: 1rem;
        justify-content: center;
        text-align: left;
      }
      .hz-ico {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: var(--surface, #fff);
        color: var(--accent, #4f46e5);
        display: grid;
        place-items: center;
        box-shadow: var(--shadow-sm, 0 1px 2px rgba(15, 23, 42, 0.05));
      }
      .hz-ico svg {
        width: 22px;
        height: 22px;
      }
      .hz-text {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        font-size: 0.88rem;
        color: var(--text-secondary, #475569);
      }
      .hz-text strong {
        color: var(--text, #0f172a);
        font-weight: 700;
      }
      .hz-preview {
        margin-top: 0.85rem;
        display: flex;
        align-items: center;
        gap: 0.85rem;
        padding: 0.65rem 0.85rem;
        border-radius: 12px;
        border: 1px solid var(--border, #e2e8f0);
        background: var(--surface, #fff);
      }
      .hz-thumb {
        width: 52px;
        height: 52px;
        object-fit: cover;
        border-radius: 8px;
        flex-shrink: 0;
      }
      .hz-doc {
        width: 52px;
        height: 52px;
        border-radius: 8px;
        background: var(--bg-subtle, #e2e8f0);
        display: grid;
        place-items: center;
        color: var(--muted, #64748b);
        flex-shrink: 0;
      }
      .hz-doc svg {
        width: 26px;
        height: 26px;
      }
      .hz-meta {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .hz-name {
        font-size: 0.86rem;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .hz-remove {
        flex-shrink: 0;
        border: none;
        background: transparent;
        color: var(--danger, #dc2626);
        font: inherit;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        padding: 0.25rem 0.5rem;
        border-radius: 8px;
      }
      .hz-remove:hover:not(:disabled) {
        background: rgba(220, 38, 38, 0.08);
      }
      .hz-err {
        margin: 0.5rem 0 0;
        font-size: 0.8rem;
        color: var(--danger, #dc2626);
        font-weight: 500;
      }
    `,
  ],
})
export class HomeworkAttachmentDropzoneComponent implements OnDestroy {
  private readonly host = inject(ElementRef);

  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  @Input() disabled = false;
  @Input() accept =
    '.pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png';
  @Input() hint = 'PDF, Word, JPG, or PNG · max practical size per school policy';
  @Input() allowedExt: string[] = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];

  @Output() fileChange = new EventEmitter<File | null>();

  dragOver = false;
  fileName = '';
  previewUrl: string | null = null;
  error = '';

  ngOnDestroy(): void {
    this.revokePreview();
  }

  onDragOver(e: DragEvent): void {
    if (this.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    this.dragOver = true;
  }

  onDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.dragOver = false;
  }

  onDrop(e: DragEvent): void {
    if (this.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    this.dragOver = false;
    const f = e.dataTransfer?.files?.[0] ?? null;
    this.applyFile(f);
  }

  onPick(e: Event): void {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    this.applyFile(f);
    input.value = '';
  }

  applyFile(file: File | null): void {
    this.error = '';
    if (!file) {
      this.emitClear();
      return;
    }
    const ext = file.name.includes('.') ? (file.name.split('.').pop() || '').toLowerCase() : '';
    if (!this.allowedExt.includes(ext)) {
      this.error = 'Use PDF, Word (.doc, .docx), JPG, or PNG only.';
      this.emitClear();
      return;
    }
    this.fileName = file.name;
    this.revokePreview();
    if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
      this.previewUrl = URL.createObjectURL(file);
    } else {
      this.previewUrl = null;
    }
    this.fileChange.emit(file);
  }

  clear(ev?: Event): void {
    ev?.stopPropagation();
    this.error = '';
    this.fileName = '';
    this.revokePreview();
    this.fileChange.emit(null);
  }

  private emitClear(): void {
    this.fileName = '';
    this.revokePreview();
  }

  private revokePreview(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
  }
}
