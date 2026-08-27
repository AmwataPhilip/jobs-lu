import { SignUpDetails } from './../models/sign-up-details.model';
import { Injectable, OnDestroy, inject } from '@angular/core';
import {
  Auth,
  User,
  user,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from '@angular/fire/auth';
import { Subscription, take, lastValueFrom } from 'rxjs';
import { ROUTES } from '../consts/routes.consts';
import { Router } from '@angular/router';

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
    await signInWithPopup(this.auth, provider);
  }

  async signInWithEmail(email: string, password: string) {
    await signInWithEmailAndPassword(this.auth, email, password);
  }

  async signUpWithEmail(signUpDetails: SignUpDetails) {
    await createUserWithEmailAndPassword(
      this.auth,
      signUpDetails.email,
      signUpDetails.password
    );
  }

  async signOut() {
    await signOut(this.auth);
    this.router.navigateByUrl(ROUTES.authentication.signIn);
  }
}
