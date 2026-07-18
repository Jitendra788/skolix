import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { portalLoginErrorMessage } from '../core/portal-login.util';
import { SessionService } from '../core/session.service';

@Component({
  selector: 'app-student-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  styleUrls: ['./portal-auth.shared.scss'],
  template: `
    <main class="auth-page">
      <section class="auth-shell">
        <aside class="auth-hero">
          <p class="auth-kicker">Student Portal</p>
          <h1>Learning Dashboard</h1>
          <p>Check homework, notices, and class updates in a focused and simple student view.</p>
          <div class="auth-illustration" aria-hidden="true">
            <div>
              <strong>Back to<br />School</strong>
              <span>Student Access</span>
            </div>
          </div>
        </aside>
        <div class="auth-panel">
          <h2 class="auth-title">Student Login</h2>
          <p class="auth-sub">Sign in using admission no. or assigned login id.</p>
          @if (error) {
            <p class="auth-alert">{{ error }}</p>
          }
          <form (ngSubmit)="login()" class="auth-form">
            <input class="auth-input" [(ngModel)]="admissionNo" name="admissionNo" placeholder="Admission No. / Login ID" />
            <input class="auth-input" [(ngModel)]="password" name="password" type="password" placeholder="Password" />
            <button class="btn primary auth-btn" type="submit" [disabled]="busy">{{ busy ? 'Please wait…' : 'Login as Student' }}</button>
          </form>
          <div class="auth-meta">
            <a routerLink="/login" class="auth-back">← Back</a>
          </div>
        </div>
      </section>
    </main>
  `,
})
export class StudentLoginComponent {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  admissionNo = '';
  password = '';
  busy = false;
  error = '';

  login(): void {
    if (this.busy) return;
    this.error = '';
    this.busy = true;
    this.api
      .login({ role: 'student', login_id: this.admissionNo.trim(), password: this.password })
      .subscribe({
        next: (res) => {
          this.busy = false;
          this.session.loginAs(res.role, res.token, res.user_id, res.display_name);
          this.router.navigateByUrl('/student');
        },
        error: (err) => {
          this.busy = false;
          this.error = portalLoginErrorMessage(err, 'student');
        },
      });
  }
}
