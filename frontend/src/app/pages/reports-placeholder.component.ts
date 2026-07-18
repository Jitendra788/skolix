import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-reports-placeholder',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="rp-page">
      <header class="rp-head">
        <h1>{{ title() }}</h1>
        <p>{{ description() }}</p>
      </header>

      <div class="rp-card">
        <p class="rp-note">
          This module is now unlocked and ready for use.
        </p>
        <div class="rp-actions">
          <a routerLink="/attendance" class="rp-btn">Attendance</a>
          <a routerLink="/accounts/fee-collection" class="rp-btn">Fee Collection</a>
          <a routerLink="/reports/students-report-card" class="rp-btn">Student Report Card</a>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .rp-page { display: flex; flex-direction: column; gap: 0.75rem; }
      .rp-head { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 0.9rem 1rem; }
      .rp-head h1 { margin: 0; font-size: 1.05rem; }
      .rp-head p { margin: 0.3rem 0 0; color: var(--muted); font-size: 0.9rem; }
      .rp-card { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 1rem; }
      .rp-note { margin: 0 0 0.75rem; color: var(--text); }
      .rp-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
      .rp-btn {
        display: inline-flex; align-items: center; justify-content: center;
        border: 1px solid var(--border); border-radius: 8px; padding: 0.45rem 0.75rem;
        text-decoration: none; color: var(--text); background: var(--surface); font-weight: 600;
      }
    `,
  ],
})
export class ReportsPlaceholderComponent {
  private readonly route = inject(ActivatedRoute);

  readonly title = computed(() => (this.route.snapshot.data['title'] as string) || 'Report');
  readonly description = computed(
    () =>
      (this.route.snapshot.data['description'] as string) ||
      'You can now access this section from the sidebar.',
  );
}

