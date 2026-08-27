import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import {
  AuthenticationService,
  UnauthorizedSignInError,
} from '../../../services/authentication.service';
import { CommonModule } from '@angular/common';
import { ROUTES } from '../../../consts/routes.consts';
import gsap from 'gsap';

@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sign-in.component.html',
  styles: ``,
})
export class SignInComponent implements AfterViewInit {
  @ViewChild('signInCard') signInCard!: ElementRef<HTMLElement>;
  errorMessage: string | null = null;

  constructor(
    private authenticationService: AuthenticationService,
    private router: Router
  ) {}

  ngAfterViewInit() {
    gsap.from(this.signInCard.nativeElement.children, {
      opacity: 0,
      y: 16,
      duration: 0.5,
      stagger: 0.1,
      ease: 'power2.out',
    });
  }

  async handleGoogleSignIn() {
    this.errorMessage = null;
    try {
      await this.authenticationService.signInWithGoogle();
      await this.router.navigateByUrl(ROUTES.dashboard);
    } catch (error) {
      this.errorMessage =
        error instanceof UnauthorizedSignInError
          ? error.message
          : 'Something went wrong signing you in. Please try again.';
    }
  }
}
