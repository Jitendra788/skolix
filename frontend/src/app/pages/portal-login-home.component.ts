import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-portal-login-home',
  standalone: true,
  imports: [RouterLink],
  styleUrls: ['./portal-auth.shared.scss'],
  template: `
    <main class="auth-page">
      <section class="auth-shell">
        <aside class="auth-hero">
          <p class="auth-kicker">Skolix Suite</p>
          <h1>Choose your portal</h1>
          <p>Admin, Teacher, and Student portals now share the same modern design language.</p>
        </aside>
        <div class="auth-panel">
          <h2 class="auth-title">Portals</h2>
          <p class="auth-sub">Select login type to continue.</p>
          <div class="portal-grid-auth">
            <a routerLink="/login/admin" class="portal-link">
              <span>Admin Portal</span>
              <strong>→</strong>
            </a>
            <a routerLink="/login/teacher" class="portal-link">
              <span>Teacher Portal</span>
              <strong>→</strong>
            </a>
            <a routerLink="/login/student" class="portal-link">
              <span>Student Portal</span>
              <strong>→</strong>
            </a>
          </div>
        </div>
      </section>
    </main>
  `,
})
export class PortalLoginHomeComponent {}
