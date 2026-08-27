import { Routes } from '@angular/router';
import {
  AuthGuard,
  redirectLoggedInTo,
  redirectUnauthorizedTo,
} from '@angular/fire/auth-guard';
import { ROUTES } from './consts/routes.consts';
import { SignInComponent } from './view/authentication/sign-in/sign-in.component';
import { DashboardComponent } from './view/dashboard/dashboard.component';
import { JobDetailComponent } from './view/job-detail/job-detail.component';
// TEMPORARY — see admin-seed.component.ts; remove this import + route below
// once production seeding is confirmed done.
import { AdminSeedComponent } from './view/admin-seed/admin-seed.component';

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
    component: DashboardComponent,
    canActivate: [AuthGuard],
    data: {
      authGuardPipe: redirectUnauthorizedToLogin,
    },
  },
  {
    path: `${ROUTES.jobs}/:jobId`,
    component: JobDetailComponent,
    canActivate: [AuthGuard],
    data: {
      authGuardPipe: redirectUnauthorizedToLogin,
    },
  },
  {
    path: ROUTES.authentication.signIn,
    component: SignInComponent,
    canActivate: [AuthGuard],
    data: { authGuardPipe: redirectLoggedInToHome },
  },
  // TEMPORARY — remove once production seeding is confirmed done.
  {
    path: 'admin-seed',
    component: AdminSeedComponent,
    canActivate: [AuthGuard],
    data: { authGuardPipe: redirectUnauthorizedToLogin },
  },
];
