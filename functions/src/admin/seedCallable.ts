import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GEMINI_API_KEY } from '../config/secrets';
import { isAllowlisted } from '../config/allowlist';
import { seedReferenceData } from './seedReferenceData';

// TEMPORARY — for the one-time production seed via a button in the app
// (no Application Default Credentials were available to run scripts/seed.ts
// directly against prod on 2026-08-27). Remove this file, its export in
// index.ts, and the frontend admin-seed route once seeding is confirmed done.
export const adminSeedReferenceData = onCall(
  { secrets: [GEMINI_API_KEY] },
  async (request) => {
    if (!isAllowlisted(request.auth?.token.email)) {
      throw new HttpsError('permission-denied', 'Not authorized.');
    }
    return seedReferenceData(GEMINI_API_KEY.value());
  }
);
