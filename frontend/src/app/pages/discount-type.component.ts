import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { ApiService } from '../core/api.service';

type DiscountMode = 'percentage' | 'fixed_amount' | 'none';

@Component({
  selector: 'app-discount-type',
  standalone: true,
  imports: [FormsModule],
  styleUrl: './discount-type.component.scss',
  template: `
    <div class="dt-page">
      <nav class="dt-bc" aria-label="Breadcrumb">
        <span>General settings</span>
        <span class="dt-bc-sep">/</span>
        <span class="dt-bc-here">Discount type</span>
      </nav>
      <header class="dt-head">
        <h1 class="dt-title">Discount type</h1>
        <p class="dt-lede">
          Choose how your school applies <strong>fee discounts</strong> when recording concessions in general settings.
          Staff should follow this policy when entering discounts on student fee ledgers (see <strong>Fee collection</strong>).
        </p>
      </header>
      @if (err) {
        <p class="dt-alert dt-err">{{ err }}</p>
      }
      @if (ok) {
        <p class="dt-alert dt-ok">{{ ok }}</p>
      }
      @if (loading) {
        <p class="dt-muted">Loading…</p>
      } @else {
        <div class="dt-grid">
          @for (opt of options; track opt.id) {
            <label class="dt-card" [class.dt-card-active]="discountType === opt.id">
              <input type="radio" name="dt" class="dt-radio" [(ngModel)]="discountType" [value]="opt.id" />
              <span class="dt-card-title">{{ opt.title }}</span>
              <span class="dt-card-desc">{{ opt.desc }}</span>
            </label>
          }
        </div>
        <div class="dt-actions">
          <button type="button" class="btn primary" [disabled]="saving" (click)="save()">
            {{ saving ? 'Saving…' : 'Save discount type' }}
          </button>
        </div>
      }
    </div>
  `,
})
export class DiscountTypeComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly options: { id: DiscountMode; title: string; desc: string }[] = [
    {
      id: 'percentage',
      title: 'Percentage discount',
      desc: 'Concessions are calculated as a percent of gross or subtotal (e.g. 10% sibling discount).',
    },
    {
      id: 'fixed_amount',
      title: 'Fixed amount',
      desc: 'Discounts are entered as a flat currency amount per student or fee slip.',
    },
    {
      id: 'none',
      title: 'No default discount',
      desc: 'No institute-wide default; discounts are only applied when explicitly allowed per case.',
    },
  ];

  discountType: DiscountMode = 'percentage';
  loading = false;
  saving = false;
  err = '';
  ok = '';

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.err = '';
    this.loading = true;
    this.api
      .getInstituteProfile()
      .pipe(catchError(() => of(null)))
      .subscribe({
        next: (p) => {
          this.loading = false;
          if (!p) {
            this.err = 'Could not load settings.';
            return;
          }
          const d = (p.discount_type || 'percentage').toLowerCase();
          this.discountType =
            d === 'fixed_amount' || d === 'none' || d === 'percentage' ? (d as DiscountMode) : 'percentage';
        },
        error: () => {
          this.loading = false;
          this.err = 'Could not load settings.';
        },
      });
  }

  save(): void {
    this.err = '';
    this.ok = '';
    this.saving = true;
    this.api
      .updateInstituteProfile({ discount_type: this.discountType })
      .pipe(catchError(() => of(null)))
      .subscribe({
        next: (p) => {
          this.saving = false;
          if (!p) {
            this.err = 'Save failed.';
            return;
          }
          this.ok = 'Discount type saved.';
        },
        error: () => {
          this.saving = false;
          this.err = 'Save failed.';
        },
      });
  }
}
