/**
 * EU WorkMe is a closed, two-user app. Only these emails may ever sign in.
 * Enforced at the Identity Platform layer by the blocking functions in
 * ../auth/blockingFunctions.ts, and again in firestore.rules/storage.rules.
 */

export const ALLOWLISTED_EMAILS: readonly string[] = [
  'philip@amwatatech.com',
  'chiarawitry5@gmail.com',
];

const NORMALIZED_ALLOWLIST = ALLOWLISTED_EMAILS.map((email) =>
  email.toLowerCase()
);

export function isAllowlisted(email: string | undefined | null): boolean {
  if (!email) {
    return false;
  }
  return NORMALIZED_ALLOWLIST.includes(email.toLowerCase());
}
