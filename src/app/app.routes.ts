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
import { AdminComponent } from './view/admin/admin.component';
import { OtherMatchesComponent } from './view/other-matches/other-matches.component';
import { ApplicationsComponent } from './view/applications/applications.component';

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
  {
    path: 'admin',
    component: AdminComponent,
    canActivate: [AuthGuard],
    data: { authGuardPipe: redirectUnauthorizedToLogin },
  },
  {
    path: ROUTES.otherMatches,
    component: OtherMatchesComponent,
    canActivate: [AuthGuard],
    data: { authGuardPipe: redirectUnauthorizedToLogin },
  },
  {
    path: ROUTES.applications,
    component: ApplicationsComponent,
    canActivate: [AuthGuard],
    data: { authGuardPipe: redirectUnauthorizedToLogin },
  },
];
