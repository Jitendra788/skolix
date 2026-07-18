import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  template: `
    @if (toast.message()) {
      <div class="app-toast" role="status" aria-live="polite">
        <span class="app-toast-ico" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </span>
        <span class="app-toast-text">{{ toast.message() }}</span>
      </div>
    }
  `,
  styles: [
    `
      .app-toast {
        position: fixed;
        bottom: 1.25rem;
        right: 1.25rem;
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 0.65rem;
        padding: 0.85rem 1.15rem;
        border-radius: 12px;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        color: #f8fafc;
        font-size: 0.9rem;
        font-weight: 600;
        box-shadow:
          0 10px 40px rgba(15, 23, 42, 0.35),
          0 0 0 1px rgba(255, 255, 255, 0.06);
        animation: toast-in 0.28s ease;
        max-width: min(420px, calc(100vw - 2.5rem));
      }
      .app-toast-ico {
        flex-shrink: 0;
        width: 22px;
        height: 22px;
        color: #4ade80;
      }
      .app-toast-ico svg {
        width: 100%;
        height: 100%;
      }
      .app-toast-text {
        line-height: 1.35;
      }
      @keyframes toast-in {
        from {
          opacity: 0;
          transform: translateY(12px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @media (max-width: 520px) {
        .app-toast {
          left: 1rem;
          right: 1rem;
          bottom: 1rem;
          max-width: none;
        }
      }
    `,
  ],
})
export class ToastComponent {
  readonly toast = inject(ToastService);
}
