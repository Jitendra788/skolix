import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { catchError, filter, forkJoin, of, Subscription, take } from 'rxjs';
import { ApiService, Faculty, SchoolClassRow } from '../core/api.service';
import { SessionService } from '../core/session.service';
import { SchoolRefService } from '../core/school-ref.service';
import { ensureTimetableSampleEntry } from '../core/timetable-local.util';

export type ShellNavGroupIcon =
  | 'gear'
  | 'books'
  | 'book-open'
  | 'calendar'
  | 'clipboard'
  | 'user'
  | 'briefcase'
  | 'calculator'
  | 'banknote'
  | 'clock'
  | 'chart';

export type ShellNavGroupId =
  | 'general'
  | 'classes'
  | 'students'
  | 'subjects'
  | 'timetable'
  | 'employees'
  | 'reports'
  | 'accounts'
  | 'salary'
  | 'attendance';

export interface ShellNavSubItem {
  path: string | null;
  label: string;
  /** Show small lock; if no path, row is non-navigable */
  locked?: boolean;
  exact?: boolean;
}

export interface ShellNavGroup {
  id: ShellNavGroupId;
  label: string;
  icon: ShellNavGroupIcon;
  subs: ShellNavSubItem[];
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit, OnDestroy {
  private readonly schoolRef = inject(SchoolRefService);
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef);
  private navSub?: Subscription;

  readonly sidebarOpen = signal(false);
  readonly classTestsOpen = signal(false);
  readonly userMenuOpen = signal(false);

  /** Sidebar accordion: one section open at a time; all collapsed by default */
  readonly groupOpen = signal<Record<ShellNavGroupId, boolean>>({
    general: false,
    classes: false,
    students: false,
    subjects: false,
    timetable: false,
    employees: false,
    reports: false,
    accounts: false,
    salary: false,
    attendance: false,
  });

  readonly navGroups: ShellNavGroup[] = [
    {
      id: 'general',
      label: 'General Settings',
      icon: 'gear',
      subs: [
        { path: '/settings/institute-profile', label: 'Institute Profile', exact: true },
        { path: '/settings/school-setup', label: 'School setup', exact: true },
        { path: '/settings/fee-structure', label: 'Fee structure', exact: true },
        { path: '/settings/fee-particulars', label: 'Fees Particulars', exact: true },
        { path: '/settings/discount-type', label: 'Discount type', exact: true },
        { path: '/notices', label: 'Notice board' },
        { path: '/ptm', label: 'PTM' },
        { path: '/gallery', label: 'Gallery' },
        { path: '/messaging', label: 'Messaging' },
        { path: '/whatsapp', label: 'WhatsApp' },
      ],
    },
    {
      id: 'classes',
      label: 'Classes',
      icon: 'clipboard',
      subs: [
        { path: '/classes/list', label: 'All Classes', exact: true },
        { path: '/classes/new', label: 'New Class', exact: true },
      ],
    },
    {
      id: 'students',
      label: 'Students',
      icon: 'user',
      subs: [
        { path: '/students/admission', label: 'New Student', exact: true },
        { path: '/students/admission-letter', label: 'Admission Letter', exact: true },
        { path: '/students/id-card', label: 'Student ID card', exact: true },
        { path: '/students/import', label: 'Import students', exact: true },
        { path: '/students/promote', label: 'Promote students', exact: true },
        { path: '/students/portal-login', label: 'Portal passwords', exact: true },
        { path: '/students/all', label: 'All Students', exact: true },
      ],
    },
    {
      id: 'subjects',
      label: 'Subjects',
      icon: 'book-open',
      subs: [
        { path: '/subjects/by-class', label: 'Classes With Subjects', exact: true },
        { path: '/subjects/assign', label: 'Assign Subjects', exact: true },
      ],
    },
    {
      id: 'timetable',
      label: 'Timetable',
      icon: 'calendar',
      subs: [
        { path: '/timetable/weekdays', label: 'Weekdays', exact: true },
        { path: '/timetable/time-periods', label: 'Time Periods', exact: true },
        { path: '/timetable/class-rooms', label: 'Class Rooms', exact: true },
        { path: '/timetable/create', label: 'Create Timetable', exact: true },
        { path: '/timetable/generate-class', label: 'Generate For Class', exact: true },
        { path: '/timetable/generate-teacher', label: 'Generate For Teacher', exact: true },
      ],
    },
    {
      id: 'employees',
      label: 'Employees',
      icon: 'briefcase',
      subs: [
        { path: '/faculty', label: 'Faculty' },
        { path: '/faculty/portal-login', label: 'Teacher portal passwords', exact: true },
      ],
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: 'chart',
      subs: [
        { path: '/reports/students-report-card', label: 'Students report Card', exact: true },
        { path: '/reports/students-info', label: 'Students info report', exact: true },
        { path: '/reports/parents-info', label: 'Parents info report', exact: true },
        { path: '/reports/students-monthly-attendance', label: 'Students Monthly Attendance Report', exact: true },
        { path: '/reports/staff-monthly-attendance', label: 'Staff Monthly Attendance Report', exact: true },
      ],
    },
    {
      id: 'accounts',
      label: 'Accounts',
      icon: 'calculator',
      subs: [
        { path: '/accounts/fee-collection', label: 'Fee collection', exact: true },
        { path: '/accounts/ledger', label: 'Ledger', exact: true },
        { path: '/accounts/reports', label: 'Reports', exact: true },
      ],
    },
    {
      id: 'salary',
      label: 'Salary',
      icon: 'banknote',
      subs: [{ path: '/salary/payroll', label: 'Payroll', exact: true }],
    },
    {
      id: 'attendance',
      label: 'Attendance',
      icon: 'clock',
      subs: [{ path: '/attendance', label: 'Attendance register' }],
    },
  ];

  ngOnInit(): void {
    this.schoolRef.loadAll();
    forkJoin({
      classes: this.api.listSchoolClasses().pipe(catchError(() => of<SchoolClassRow[]>([]))),
      faculty: this.api.listFaculty().pipe(catchError(() => of<Faculty[]>([]))),
    })
      .pipe(take(1))
      .subscribe(({ classes, faculty }) => {
        const teacher = (faculty[0]?.name || '').trim();
        ensureTimetableSampleEntry(classes, teacher);
      });
    this.syncOpenGroupsFromUrl(this.router.url);
    this.navSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.syncOpenGroupsFromUrl(this.router.url));
  }

  ngOnDestroy(): void {
    this.navSub?.unsubscribe();
  }

  isGroupOpen(id: ShellNavGroupId): boolean {
    return this.groupOpen()[id];
  }

  toggleGroup(id: ShellNavGroupId): void {
    this.groupOpen.update((m) => {
      if (m[id]) {
        return this.allGroupsClosed();
      }
      return { ...this.allGroupsClosed(), [id]: true };
    });
  }

  private allGroupsClosed(): Record<ShellNavGroupId, boolean> {
    return {
      general: false,
      classes: false,
      students: false,
      subjects: false,
      timetable: false,
      employees: false,
      reports: false,
      accounts: false,
      salary: false,
      attendance: false,
    };
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  isClassTestsOpen(): boolean {
    return this.classTestsOpen();
  }

  toggleClassTestsGroup(): void {
    this.classTestsOpen.update((v) => !v);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  userDisplayName(): string {
    return this.session.displayName() || 'School admin';
  }

  userRoleLabel(): string {
    const role = this.session.currentRole();
    if (role === 'admin') return 'Admin';
    if (role === 'teacher') return 'Teacher';
    if (role === 'student') return 'Student';
    return 'User';
  }

  userInitial(): string {
    const name = this.userDisplayName().trim();
    return name ? name[0].toUpperCase() : 'U';
  }

  isTeacherPortal(): boolean {
    return this.session.isLoggedInAs('teacher');
  }

  isStudentPortal(): boolean {
    return this.session.isLoggedInAs('student');
  }

  portalSubtitle(): string {
    if (this.session.isLoggedInAs('student')) return 'Student portal';
    if (this.session.isLoggedInAs('teacher')) return 'Teacher portal';
    return 'Admin portal';
  }

  toggleUserMenu(ev: Event): void {
    ev.stopPropagation();
    this.userMenuOpen.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    if (!this.userMenuOpen()) return;
    const root = this.host.nativeElement as HTMLElement;
    const wrap = root.querySelector('.esk-user-menu');
    if (wrap && !wrap.contains(ev.target as Node)) {
      this.userMenuOpen.set(false);
    }
  }

  logout(): void {
    this.userMenuOpen.set(false);
    let loginUrl = '/login';
    if (this.session.isLoggedInAs('student')) loginUrl = '/login/student';
    else if (this.session.isLoggedInAs('teacher')) loginUrl = '/login/teacher';
    this.session.logout();
    this.closeSidebar();
    void this.router.navigateByUrl(loginUrl);
  }

  private syncOpenGroupsFromUrl(rawUrl: string): void {
    const url = rawUrl.split('?')[0] || '';
    const next = this.allGroupsClosed();
    let open: ShellNavGroupId | null = null;

    if (
      url.startsWith('/settings') ||
      url.startsWith('/notices') ||
      url.startsWith('/messaging') ||
      url.startsWith('/whatsapp') ||
      url.startsWith('/ptm') ||
      url.startsWith('/gallery')
    ) {
      open = 'general';
    } else if (url.startsWith('/classes')) {
      open = 'classes';
    } else if (url.startsWith('/students')) {
      open = 'students';
    } else if (url.startsWith('/subjects')) {
      open = 'subjects';
    } else if (url.startsWith('/timetable')) {
      open = 'timetable';
    } else if (url.startsWith('/faculty')) {
      open = 'employees';
    } else if (url.startsWith('/reports')) {
      open = 'reports';
    } else if (url.startsWith('/accounts')) {
      open = 'accounts';
    } else if (url.startsWith('/attendance')) {
      open = 'attendance';
    }

    if (open) {
      next[open] = true;
    }
    this.classTestsOpen.set(url.startsWith('/class-tests'));
    this.groupOpen.set(next);
  }
}
