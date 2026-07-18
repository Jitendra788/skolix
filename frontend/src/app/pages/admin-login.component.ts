import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { isApiOriginConfigured, portalLoginErrorMessage } from '../core/portal-login.util';
import { SessionService } from '../core/session.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  styleUrls: ['./portal-auth.shared.scss'],
  template: `
    <main class="auth-page">
      <section class="auth-shell">
        <aside class="auth-hero">
          <p class="auth-kicker">Admin Portal</p>
          <h1>School Control Center</h1>
          <p>Manage institute settings, staff, students, finance, and reports from one place.</p>
          <div class="auth-illustration" aria-hidden="true">
            <div>
              <strong>Back to<br />School</strong>
              <span>Admin Access</span>
            </div>
          </div>
        </aside>
        <div class="auth-panel">
          <h2 class="auth-title">Admin Login</h2>
          <p class="auth-sub">Sign in with admin credentials.</p>
          <p class="auth-hint">Default: <code>admin</code> / <code>admin123</code></p>
          @if (!apiReady) {
            <p class="auth-alert">
              API not configured. Set Vercel env <code>API_ORIGIN</code> to your public FastAPI URL, then redeploy.
            </p>
          }
          @if (error) {
            <p class="auth-alert">{{ error }}</p>
          }
          <form (ngSubmit)="login()" class="auth-form">
            <input class="auth-input" [(ngModel)]="username" name="username" placeholder="Username" />
            <input class="auth-input" [(ngModel)]="password" name="password" type="password" placeholder="Password" />
            <button class="btn primary auth-btn" type="submit" [disabled]="busy">{{ busy ? 'Please wait…' : 'Login as Admin' }}</button>
          </form>
          <div class="auth-meta">
            <a routerLink="/login" class="auth-back">← Back</a>
          </div>
        </div>
      </section>
    </main>
  `,
})
export class AdminLoginComponent {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  username = '';
  password = '';
  busy = false;
  error = '';
  readonly apiReady = isApiOriginConfigured(
    (typeof window !== 'undefined' &&
      (window as Window & { __SKOLIX_API_ORIGIN__?: string }).__SKOLIX_API_ORIGIN__) ||
      environment.apiOrigin,
  );

  login(): void {
    if (this.busy) return;
    this.error = '';
    if (!this.apiReady) {
      this.error =
        'API not configured. Set Vercel env API_ORIGIN to your public backend URL and redeploy.';
      return;
    }
    this.busy = true;
    this.api
      .login({ role: 'admin', login_id: this.username.trim(), password: this.password })
      .subscribe({
        next: (res) => {
          this.busy = false;
          this.session.loginAs(res.role, res.token, res.user_id, res.display_name);
          this.router.navigateByUrl('/');
        },
        error: (err) => {
          this.busy = false;
          this.error = portalLoginErrorMessage(err, 'admin');
        },
      });
  }
}
