import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { SessionService } from '../core/session.service';

@Component({
  selector: 'app-teacher-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  styleUrls: ['./portal-auth.shared.scss'],
  template: `
    <main class="auth-page">
      <section class="auth-shell">
        <aside class="auth-hero">
          <p class="auth-kicker">Teacher Portal</p>
          <h1>Classroom Workspace</h1>
          <p>Track homework, attendance, and daily class updates with a clean workflow.</p>
          <div class="auth-illustration" aria-hidden="true">
            <div>
              <strong>Back to<br />School</strong>
              <span>Teacher Access</span>
            </div>
          </div>
        </aside>
        <div class="auth-panel">
          <h2 class="auth-title">Teacher Login</h2>
          <p class="auth-sub">Use email / username / phone and password.</p>
          @if (error) {
            <p class="auth-alert">{{ error }}</p>
          }
          <form (ngSubmit)="login()" class="auth-form">
            <input class="auth-input" [(ngModel)]="employeeId" name="employeeId" placeholder="Email / Username / Phone" />
            <input class="auth-input" [(ngModel)]="password" name="password" type="password" placeholder="Password" />
            <button class="btn primary auth-btn" type="submit" [disabled]="busy">{{ busy ? 'Please wait…' : 'Login as Teacher' }}</button>
          </form>
          <div class="auth-meta">
            <a routerLink="/login" class="auth-back">← Back</a>
          </div>
        </div>
      </section>
    </main>
  `,
})
export class TeacherLoginComponent {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  employeeId = '';
  password = '';
  busy = false;
  error = '';

  login(): void {
    if (this.busy) return;
    this.error = '';
    this.busy = true;
    this.api
      .login({ role: 'teacher', login_id: this.employeeId.trim(), password: this.password })
      .subscribe({
        next: (res) => {
          this.busy = false;
          this.session.loginAs(
            res.role,
            res.token,
            res.user_id,
            res.display_name,
            res.class_assigned
          );
          this.router.navigateByUrl('/teacher');
        },
        error: () => {
          this.busy = false;
          this.error = 'Invalid teacher credentials.';
        },
      });
  }
}
