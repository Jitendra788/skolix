import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService, UserRole } from './session.service';

function guardFor(role: UserRole, loginPath: string): CanActivateFn {
  return () => {
    const session = inject(SessionService);
    const router = inject(Router);
    if (session.isLoggedInAs(role)) return true;
    return router.createUrlTree([loginPath]);
  };
}

export const adminGuard = guardFor('admin', '/login/admin');
export const teacherGuard = guardFor('teacher', '/login/teacher');
export const studentGuard = guardFor('student', '/login/student');
