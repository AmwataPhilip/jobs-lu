import { Component } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { AuthenticationService } from '../../../services/authentication.service';
import { SignInCredentials } from '../../../models/sign-in-credentials.model';
import { CommonModule } from '@angular/common';
import { ROUTES } from '../../../consts/routes.consts';

@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './sign-in.component.html',
  styles: ``,
})
export class SignInComponent {
  signInForm: FormGroup;
  isPasswordVisible = false;
  constructor(
    private authenticationService: AuthenticationService,
    private router: Router,
    private fb: FormBuilder
  ) {
    this.signInForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });
  }

  get signInFormValue(): SignInCredentials {
    return this.signInForm.value as SignInCredentials;
  }

  async handleGoogleSignIn() {
    await this.authenticationService.signInWithGoogle();
    await this.router.navigateByUrl(ROUTES.placeholder);
  }

  async handleEmailSignIn() {
    await this.authenticationService.signInWithEmail(
      this.signInFormValue.email,
      this.signInFormValue.password
    );
    await this.router.navigateByUrl(ROUTES.placeholder);
  }

  async handleNavigateToSignUp() {
    await this.router.navigateByUrl(ROUTES.authentication.signUp);
  }

  togglePasswordVisibility() {
    this.isPasswordVisible = !this.isPasswordVisible;
    const passwordField = this.signInForm.get('password');
    if (passwordField) passwordField.setValue(passwordField.value);
  }
}
