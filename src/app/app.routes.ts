import { Routes } from '@angular/router';
import {
  AuthGuard,
  redirectLoggedInTo,
  redirectUnauthorizedTo,
} from '@angular/fire/auth-guard';
import { ROUTES } from './consts/routes.consts';

const redirectLoggedInToHome = () => redirectLoggedInTo([ROUTES.dashboard]);
const redirectUnauthorizedToLogin = () =>
  redirectUnauthorizedTo([ROUTES.authentication.signIn]);

export const routes: Routes = [
  {
    path: '',
    redirectTo: ROUTES.dashboard,
    pathMatch: 'full',
  },
  {
    path: ROUTES.dashboard,
    loadComponent: () =>
      import('./view/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    canActivate: [AuthGuard],
    data: {
      authGuardPipe: redirectUnauthorizedToLogin,
    },
  },
  {
    path: `${ROUTES.jobs}/:jobId`,
    loadComponent: () =>
      import('./view/job-detail/job-detail.component').then((m) => m.JobDetailComponent),
    canActivate: [AuthGuard],
    data: {
      authGuardPipe: redirectUnauthorizedToLogin,
    },
  },
  {
    path: ROUTES.authentication.signIn,
    loadComponent: () =>
      import('./view/authentication/sign-in/sign-in.component').then((m) => m.SignInComponent),
    canActivate: [AuthGuard],
    data: { authGuardPipe: redirectLoggedInToHome },
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./view/admin/admin.component').then((m) => m.AdminComponent),
    canActivate: [AuthGuard],
    data: { authGuardPipe: redirectUnauthorizedToLogin, preload: true },
  },
  {
    path: ROUTES.otherMatches,
    loadComponent: () =>
      import('./view/other-matches/other-matches.component').then((m) => m.OtherMatchesComponent),
    canActivate: [AuthGuard],
    data: { authGuardPipe: redirectUnauthorizedToLogin },
  },
  {
    path: ROUTES.applications,
    loadComponent: () =>
      import('./view/applications/applications.component').then((m) => m.ApplicationsComponent),
    canActivate: [AuthGuard],
    data: { authGuardPipe: redirectUnauthorizedToLogin },
  },
  {
    path: ROUTES.companies,
    loadComponent: () =>
      import('./view/companies/companies.component').then((m) => m.CompaniesComponent),
    canActivate: [AuthGuard],
    data: { authGuardPipe: redirectUnauthorizedToLogin },
  },
];

