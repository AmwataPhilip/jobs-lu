import { Routes } from '@angular/router';
import {
  AuthGuard,
  redirectLoggedInTo,
  redirectUnauthorizedTo,
} from '@angular/fire/auth-guard';
import { ROUTES } from './consts/routes.consts';
import { SignUpComponent } from './view/authentication/sign-up/sign-up.component';
import { SignInComponent } from './view/authentication/sign-in/sign-in.component';

const redirectLoggedInToHome = () => redirectLoggedInTo([ROUTES.placeholder]);
const redirectUnauthorizedToLogin = () =>
  redirectUnauthorizedTo([ROUTES.authentication.signIn]);

export const routes: Routes = [
  {
    path: '',
    redirectTo: ROUTES.placeholder,
    pathMatch: 'full',
  },
  {
    path: ROUTES.placeholder,
    canActivate: [AuthGuard],
    data: {
      authGuardPipe: redirectUnauthorizedToLogin,
    },
  },
  {
    path: ROUTES.authentication.signUp,
    component: SignUpComponent,
    canActivate: [AuthGuard],
    data: { authGuardPipe: redirectLoggedInToHome },
  },
  {
    path: ROUTES.authentication.signIn,
    component: SignInComponent,
    canActivate: [AuthGuard],
    data: { authGuardPipe: redirectLoggedInToHome },
  },
];
