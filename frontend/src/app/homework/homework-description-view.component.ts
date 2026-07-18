import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { QuillViewHTMLComponent } from 'ngx-quill';
import { normalizeHomeworkDescription } from '../core/homework-description.util';
import { tryParseStructured } from './homework-structured.model';

@Component({
  selector: 'app-homework-description-view',
  standalone: true,
  imports: [CommonModule, QuillViewHTMLComponent],
  template: `
    @if (structured(); as st) {
      @if (hasStructuredBody(st)) {
        <div class="hwv-structured" [class.hwv-compact]="compact()">
          @if (st.title) {
            <h4 class="hwv-title">{{ st.title }}</h4>
          }
          @if (st.instructions) {
            <div class="hwv-block">
              <span class="hwv-k">Instructions</span>
              @if (instructionsLookLikeHtml(st.instructions)) {
                <div class="hwv-quill-wrap hwv-instructions-html" [class.hwv-compact]="compact()">
                  <quill-view-html [content]="st.instructions" [sanitize]="true" />
                </div>
              } @else {
                <p class="hwv-text">{{ st.instructions }}</p>
              }
            </div>
          }
          @if (st.questions.length) {
            <div class="hwv-block">
              <span class="hwv-k">Questions / points</span>
              <ol class="hwv-olist">
                @for (q of st.questions; track $index) {
                  <li>{{ q }}</li>
                }
              </ol>
            </div>
          }
          @if (st.submissionNotes) {
            <div class="hwv-block hwv-notes">
              <span class="hwv-k">Submission notes</span>
              <p class="hwv-text">{{ st.submissionNotes }}</p>
            </div>
          }
        </div>
      } @else {
        <p class="hwv-plain" [class.hwv-pre]="compact()">—</p>
      }
    } @else if (isHtml()) {
      <div class="hwv-quill-wrap" [class.hwv-compact]="compact()">
        <quill-view-html [content]="raw()" [sanitize]="true" />
      </div>
    } @else {
      <p class="hwv-plain" [class.hwv-pre]="compact()">{{ raw() || '—' }}</p>
    }
  `,
  styles: [
    `
      .hwv-structured {
        color: var(--text, #0f172a);
      }
      .hwv-compact.hwv-structured {
        color: #475569;
      }
      .hwv-title {
        margin: 0 0 0.5rem;
        font-size: 1rem;
        font-weight: 700;
        color: var(--text, #0f172a);
      }
      .hwv-block {
        margin-bottom: 0.75rem;
      }
      .hwv-block:last-child {
        margin-bottom: 0;
      }
      .hwv-k {
        display: block;
        font-size: 0.68rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--muted, #64748b);
        margin-bottom: 0.25rem;
      }
      .hwv-text {
        margin: 0;
        line-height: 1.55;
        white-space: pre-wrap;
      }
      .hwv-olist {
        margin: 0.25rem 0 0;
        padding-left: 1.25rem;
        line-height: 1.5;
      }
      .hwv-notes .hwv-text {
        font-size: 0.92rem;
        color: var(--text-secondary, #475569);
      }
      .hwv-plain {
        margin: 0;
        line-height: 1.55;
        color: var(--text, #0f172a);
      }
      .hwv-pre {
        white-space: pre-wrap;
        color: #475569;
      }
      .hwv-quill-wrap ::ng-deep .ql-container.ngx-quill-view-html {
        border: 0;
        font-family: inherit;
      }
      .hwv-quill-wrap ::ng-deep .ql-editor {
        padding: 0;
        line-height: 1.55;
      }
      .hwv-instructions-html ::ng-deep .ql-container.ngx-quill-view-html {
        border: 0;
        font-family: inherit;
      }
      .hwv-instructions-html ::ng-deep .ql-editor {
        padding: 0;
        line-height: 1.55;
      }
      .hwv-instructions-html ::ng-deep .ql-editor p {
        margin: 0 0 0.4rem;
      }
      .hwv-instructions-html ::ng-deep .ql-editor p:last-child {
        margin-bottom: 0;
      }
    `,
  ],
})
export class HomeworkDescriptionViewComponent {
  readonly description = input<string>('');
  readonly compact = input(false);

  readonly raw = computed(() => this.description() || '');
  readonly structured = computed(() => tryParseStructured(this.description()));

  readonly isHtml = computed(() => {
    if (this.structured()) return false;
    const s = this.raw().trim();
    return s.startsWith('<');
  });

  hasStructuredBody(st: NonNullable<ReturnType<typeof tryParseStructured>>): boolean {
    return !!(
      st.title?.trim() ||
      normalizeHomeworkDescription(st.instructions) ||
      (st.questions && st.questions.some((q) => q.trim())) ||
      st.submissionNotes?.trim()
    );
  }

  /** Plain-text instructions from older homework may not start with `<`. */
  instructionsLookLikeHtml(text: string): boolean {
    return (text || '').trim().startsWith('<');
  }
}
