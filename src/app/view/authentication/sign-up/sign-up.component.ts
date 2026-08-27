import { Component } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { AuthenticationService } from '../../../services/authentication.service';
import { Router } from '@angular/router';
import { SignUpDetails } from '../../../models/sign-up-details.model';
import { CommonModule } from '@angular/common';
import { ROUTES } from '../../../consts/routes.consts';

@Component({
  selector: 'app-sign-up',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './sign-up.component.html',
})
export class SignUpComponent {
  signupForm: FormGroup;
  isPasswordVisible = false;

  constructor(
    private fb: FormBuilder,
    private authenticationService: AuthenticationService,
    private router: Router
  ) {
    this.signupForm = this.fb.group(
      {
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, this.passwordValidator]],
        confirmPassword: ['', Validators.required],
        firstName: ['', Validators.required],
        lastName: ['', Validators.required],
        phoneNumber: [
          '',
          [
            Validators.required,
            Validators.pattern('^((\\+27)|0)[6-9][0-9]{8}$'),
          ],
        ],
      },
      { validators: this.passwordsMatchValidator }
    );
  }

  get signUpFormValue(): SignUpDetails {
    return this.signupForm.value as SignUpDetails;
  }

  async handleGoogleSignIn() {
    await this.authenticationService.signInWithGoogle();
    await this.router.navigateByUrl(ROUTES.placeholder);
  }

  async handleEmailSignUp() {
    await this.authenticationService.signUpWithEmail(this.signUpFormValue);
    await this.router.navigateByUrl(ROUTES.placeholder);
  }

  async handleNavigateToSignIn() {
    await this.router.navigateByUrl(ROUTES.authentication.signIn);
  }

  togglePasswordVisibility() {
    this.isPasswordVisible = !this.isPasswordVisible;
    const passwordField = this.signupForm.get('password');
    if (passwordField) passwordField.setValue(passwordField.value);
  }

  private passwordValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumeric = /[0-9]/.test(value);
    const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(value);
    const isLengthValid = value ? value.length >= 8 : false;

    const errors: ValidationErrors = {};

    if (!hasUpperCase) {
      errors['noUpperCase'] =
        'Password must have at least one uppercase character.';
    }
    if (!hasLowerCase) {
      errors['noLowerCase'] =
        'Password must have at least one lowercase character.';
    }
    if (!hasNumeric) {
      errors['noNumeric'] =
        'Password must have at least one numeric character.';
    }
    if (!hasSpecialChars) {
      errors['noSpecialChars'] =
        'Password must have at least one special character.';
    }
    if (!isLengthValid) {
      errors['length'] = 'Password must be at least 8 characters long.';
    }

    return Object.keys(errors).length > 0 ? errors : null;
  }

  private passwordsMatchValidator(
    control: AbstractControl
  ): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;

    if (password !== confirmPassword) {
      return { passwordsMismatch: true };
    }
    return null;
  }
}
