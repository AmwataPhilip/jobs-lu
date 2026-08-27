import { HttpsError } from 'firebase-functions/v2/https';
import {
  beforeUserCreated,
  beforeUserSignedIn,
} from 'firebase-functions/v2/identity';
import { isAllowlisted } from '../config/allowlist';

// The Auth JS SDK surfaces blocking-function rejections as the generic
// 'auth/internal-error' code regardless of the HttpsError code used here, so
// src/app/services/authentication.service.ts matches on this exact message
// text to detect "not on the allowlist" specifically. Keep them in sync.
const ALLOWLIST_REJECTION_MESSAGE =
  'This app is private and your account is not authorized.';

function rejectIfNotAllowlisted(email: string | undefined) {
  if (!isAllowlisted(email)) {
    throw new HttpsError('permission-denied', ALLOWLIST_REJECTION_MESSAGE);
  }
}

// Blocks brand-new account creation (e.g. a first-time Google sign-in) for
// anyone not on the allowlist, before a user record is ever persisted.
export const beforeCreate = beforeUserCreated((event) => {
  rejectIfNotAllowlisted(event.data?.email);
});

// Blocks sign-in for existing accounts too, in case an account was ever
// created outside this check (e.g. manually via the Firebase Console).
export const beforeSignIn = beforeUserSignedIn((event) => {
  rejectIfNotAllowlisted(event.data?.email);
});
