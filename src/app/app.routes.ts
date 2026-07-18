import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'settings/institute-profile',
        loadComponent: () =>
          import('./pages/institute-profile.component').then(
            (m) => m.InstituteProfileComponent
          ),
      },
      {
        path: 'settings/school-setup',
        loadComponent: () =>
          import('./pages/school-setup.component').then((m) => m.SchoolSetupComponent),
      },
      {
        path: 'classes/list',
        loadComponent: () =>
          import('./pages/class-list.component').then((m) => m.ClassListComponent),
      },
      {
        path: 'classes/new',
        loadComponent: () =>
          import('./pages/class-form.component').then((m) => m.ClassFormComponent),
      },
      {
        path: 'classes/:id/edit',
        loadComponent: () =>
          import('./pages/class-form.component').then((m) => m.ClassFormComponent),
      },
      {
        path: 'subjects/by-class',
        loadComponent: () =>
          import('./pages/subjects-by-class.component').then((m) => m.SubjectsByClassComponent),
      },
      {
        path: 'subjects/assign',
        loadComponent: () =>
          import('./pages/assign-subjects.component').then((m) => m.AssignSubjectsComponent),
      },
      {
        path: 'settings/fee-structure',
        loadComponent: () =>
          import('./pages/fee-structure.component').then((m) => m.FeeStructureComponent),
      },
      {
        path: 'settings/discount-type',
        loadComponent: () =>
          import('./pages/discount-type.component').then((m) => m.DiscountTypeComponent),
      },
      {
        path: 'settings/fee-particulars',
        loadComponent: () =>
          import('./pages/fee-particulars.component').then((m) => m.FeeParticularsComponent),
      },
      {
        path: 'accounts/fee-collection',
        loadComponent: () =>
          import('./pages/fee-collection.component').then((m) => m.FeeCollectionComponent),
      },
      {
        path: 'school-setup',
        redirectTo: 'settings/school-setup',
        pathMatch: 'full',
      },
      {
        path: 'students',
        children: [
          {
            path: 'admission',
            loadComponent: () =>
              import('./pages/student-admission.component').then(
                (m) => m.StudentAdmissionComponent
              ),
          },
          {
            path: 'all',
            loadComponent: () =>
              import('./pages/all-students.component').then((m) => m.AllStudentsComponent),
          },
          {
            path: 'import',
            loadComponent: () =>
              import('./pages/student-import.component').then((m) => m.StudentImportComponent),
          },
          {
            path: 'promote',
            loadComponent: () =>
              import('./pages/student-promote.component').then((m) => m.StudentPromoteComponent),
          },
          {
            path: 'admission-letter',
            loadComponent: () =>
              import('./pages/student-admission-letter.component').then(
                (m) => m.StudentAdmissionLetterComponent
              ),
          },
          {
            path: 'id-card',
            loadComponent: () =>
              import('./pages/student-id-card.component').then(
                (m) => m.StudentIdCardComponent
              ),
          },
          {
            path: 'portal-login',
            loadComponent: () =>
              import('./pages/student-portal-login.component').then(
                (m) => m.StudentPortalLoginComponent
              ),
          },
          {
            path: ':studentId/report',
            loadComponent: () =>
              import('./pages/student-report.component').then((m) => m.StudentReportComponent),
          },
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'admission',
          },
        ],
      },
      {
        path: 'notices',
        loadComponent: () =>
          import('./pages/notices.component').then((m) => m.NoticesComponent),
      },
      {
        path: 'faculty',
        loadComponent: () =>
          import('./pages/faculty.component').then((m) => m.FacultyComponent),
      },
      {
        path: 'messaging',
        loadComponent: () =>
          import('./pages/whatsapp.component').then((m) => m.WhatsappComponent),
      },
      {
        path: 'whatsapp',
        loadComponent: () =>
          import('./pages/whatsapp.component').then((m) => m.WhatsappComponent),
      },
      {
        path: 'ptm',
        loadComponent: () =>
          import('./pages/ptm.component').then((m) => m.PtmComponent),
      },
      {
        path: 'gallery',
        loadComponent: () =>
          import('./pages/gallery.component').then((m) => m.GalleryComponent),
      },
      {
        path: 'attendance',
        loadComponent: () =>
          import('./pages/attendance.component').then((m) => m.AttendanceComponent),
      },
      {
        path: 'homework',
        loadComponent: () =>
          import('./pages/homework-list.component').then((m) => m.HomeworkListComponent),
      },
      {
        path: 'homework/add',
        loadComponent: () =>
          import('./pages/add-homework.component').then((m) => m.AddHomeworkComponent),
      },
      {
        path: 'class-tests',
        children: [
          {
            path: '',
            pathMatch: 'full',
            redirectTo: 'manage',
          },
          {
            path: 'manage',
            loadComponent: () =>
              import('./pages/class-tests.component').then((m) => m.ClassTestsComponent),
          },
          {
            path: 'results',
            loadComponent: () =>
              import('./pages/class-tests.component').then((m) => m.ClassTestsComponent),
          },
        ],
      },
      {
        path: 'timetable',
        pathMatch: 'full',
        redirectTo: 'timetable/weekdays',
      },
      {
        path: 'timetable/weekdays',
        loadComponent: () =>
          import('./pages/timetable-weekdays.component').then((m) => m.TimetableWeekdaysComponent),
      },
      {
        path: 'timetable/time-periods',
        loadComponent: () =>
          import('./pages/timetable-time-periods.component').then((m) => m.TimetableTimePeriodsComponent),
      },
      {
        path: 'timetable/class-rooms',
        loadComponent: () =>
          import('./pages/timetable-class-rooms.component').then((m) => m.TimetableClassRoomsComponent),
      },
      {
        path: 'timetable/create',
        loadComponent: () =>
          import('./pages/timetable-create.component').then((m) => m.TimetableCreateComponent),
      },
      {
        path: 'timetable/generate-class',
        loadComponent: () =>
          import('./pages/timetable-generate-class.component').then((m) => m.TimetableGenerateClassComponent),
      },
      {
        path: 'timetable/generate-teacher',
        loadComponent: () =>
          import('./pages/timetable-generate-teacher.component').then((m) => m.TimetableGenerateTeacherComponent),
      },
      {
        path: 'reports/students-report-card',
        loadComponent: () =>
          import('./pages/report-students-card.component').then((m) => m.ReportStudentsCardComponent),
      },
      {
        path: 'reports/students-info',
        loadComponent: () =>
          import('./pages/report-students-info.component').then((m) => m.ReportStudentsInfoComponent),
      },
      {
        path: 'reports/parents-info',
        loadComponent: () =>
          import('./pages/report-parents-info.component').then((m) => m.ReportParentsInfoComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
