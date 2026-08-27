import { Injectable, OnDestroy, inject } from '@angular/core';
import {
  Auth,
  User,
  user,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
} from '@angular/fire/auth';
import { Subscription, take, lastValueFrom } from 'rxjs';
import { ROUTES } from '../consts/routes.consts';
import { Router } from '@angular/router';

export class UnauthorizedSignInError extends Error {}

const ALLOWLIST_REJECTION_MESSAGE =
  'This app is private and your account is not authorized.';

// Client-side mirror of functions/src/config/allowlist.ts. This is a UX
// nicety, not the real security boundary — firestore.rules/storage.rules
// deny all jobslu_* access to non-allowlisted emails regardless. Identity
// Platform blocking functions (which would reject sign-in itself) aren't
// available on this shared project (no GCIP), so this client-side check is
// what keeps the sign-in flow clean instead of landing on an empty
// permission-denied dashboard.
const ALLOWLISTED_EMAILS = ['philip@amwatatech.com', 'chiarawitry5@gmail.com'];

@Injectable({
  providedIn: 'root',
})
export class AuthenticationService implements OnDestroy {
  private auth: Auth = inject(Auth);
  private router: Router = inject(Router);
  user: User | null = null;
  user$ = user(this.auth);
  userSubscription: Subscription;

  constructor() {
    this.userSubscription = this.user$.subscribe(
      (firebaseUser: User | null) => {
        this.user = firebaseUser;
      }
    );
  }

  async getUser() {
    this.user = await lastValueFrom(this.user$.pipe(take(1)));
  }

  ngOnDestroy(): void {
    this.userSubscription.unsubscribe();
  }

  async signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    let signedInEmail: string | null;
    try {
      const result = await signInWithPopup(this.auth, provider);
      signedInEmail = result.user.email;
    } catch (error: unknown) {
      // Kept for if Identity Platform blocking functions are ever enabled —
      // see functions/src/index.ts for why they're not deployed today.
      if (
        error instanceof Object &&
        'code' in error &&
        error.code === 'auth/internal-error' &&
        'message' in error &&
        typeof error.message === 'string' &&
        error.message.includes(ALLOWLIST_REJECTION_MESSAGE)
      ) {
        throw new UnauthorizedSignInError(ALLOWLIST_REJECTION_MESSAGE);
      }
      throw error;
    }

    if (!signedInEmail || !ALLOWLISTED_EMAILS.includes(signedInEmail.toLowerCase())) {
      await signOut(this.auth);
      throw new UnauthorizedSignInError(ALLOWLIST_REJECTION_MESSAGE);
    }
  }

  async signOut() {
    await signOut(this.auth);
    this.router.navigateByUrl(ROUTES.authentication.signIn);
  }
}
