import { Injectable } from '@angular/core';
import { AuthRole } from './api.service';

export type UserRole = AuthRole;

const ROLE_KEY = 'skolix_role';
const TOKEN_KEY = 'skolix_token';
const USER_ID_KEY = 'skolix_user_id';
const NAME_KEY = 'skolix_display_name';
const TEACHER_CLASS_KEY = 'skolix_teacher_class';

@Injectable({ providedIn: 'root' })
export class SessionService {
  currentRole(): UserRole | null {
    const raw = localStorage.getItem(ROLE_KEY);
    if (raw === 'admin' || raw === 'teacher' || raw === 'student') return raw;
    return null;
  }

  token(): string {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  userId(): string {
    return localStorage.getItem(USER_ID_KEY) || '';
  }

  displayName(): string {
    return localStorage.getItem(NAME_KEY) || '';
  }

  isLoggedInAs(role: UserRole): boolean {
    return this.currentRole() === role && !!this.token();
  }

  loginAs(
    role: UserRole,
    token: string,
    userId: string,
    displayName: string,
    teacherClassAssigned?: string
  ): void {
    localStorage.setItem(ROLE_KEY, role);
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_ID_KEY, userId);
    localStorage.setItem(NAME_KEY, displayName);
    if (role === 'teacher' && (teacherClassAssigned || '').trim()) {
      localStorage.setItem(TEACHER_CLASS_KEY, teacherClassAssigned!.trim());
    } else {
      localStorage.removeItem(TEACHER_CLASS_KEY);
    }
  }

  /** Faculty "class assigned" for the logged-in teacher (attendance scope). */
  teacherClassAssigned(): string {
    return localStorage.getItem(TEACHER_CLASS_KEY) || '';
  }

  logout(): void {
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(TEACHER_CLASS_KEY);
  }

  /** Update greeting name after profile save (same session, same token). */
  updateDisplayName(displayName: string): void {
    const n = displayName.trim();
    if (n) localStorage.setItem(NAME_KEY, n);
  }
}
