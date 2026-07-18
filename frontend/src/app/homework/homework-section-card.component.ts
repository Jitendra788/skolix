import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-homework-section-card',
  standalone: true,
  template: `
    <section class="hsc">
      <header class="hsc-head">
        <span class="hsc-icon" aria-hidden="true">
          <ng-content select="[slot=icon]"></ng-content>
        </span>
        <div class="hsc-titles">
          <h2 class="hsc-title">{{ title }}</h2>
          @if (subtitle) {
            <p class="hsc-sub">{{ subtitle }}</p>
          }
        </div>
      </header>
      <div class="hsc-body">
        <ng-content></ng-content>
      </div>
    </section>
  `,
  styles: [
    `
      .hsc {
        background: var(--surface, #fff);
        border: 1px solid var(--border, #e2e8f0);
        border-radius: 16px;
        box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);
        overflow: hidden;
      }
      .hsc-head {
        display: flex;
        align-items: flex-start;
        gap: 0.85rem;
        padding: 1rem 1.15rem 0.85rem;
        border-bottom: 1px solid var(--border, #e2e8f0);
        background: linear-gradient(180deg, rgba(79, 70, 229, 0.04) 0%, transparent 100%);
      }
      .hsc-icon {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        border-radius: 12px;
        display: grid;
        place-items: center;
        background: rgba(79, 70, 229, 0.12);
        color: var(--accent, #4f46e5);
      }
      .hsc-icon:empty {
        display: none;
      }
      .hsc-titles {
        min-width: 0;
        flex: 1;
      }
      .hsc-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: var(--text, #0f172a);
      }
      .hsc-sub {
        margin: 0.25rem 0 0;
        font-size: 0.82rem;
        color: var(--muted, #64748b);
        line-height: 1.4;
      }
      .hsc-body {
        padding: 1.1rem 1.15rem 1.2rem;
      }
    `,
  ],
})
export class HomeworkSectionCardComponent {
  @Input({ required: true }) title!: string;
  @Input() subtitle?: string;
}
