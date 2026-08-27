import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GEMINI_API_KEY } from '../config/secrets';
import { isAllowlisted } from '../config/allowlist';
import { seedReferenceData } from './seedReferenceData';

// Re-seeds persona profiles + the ADEM shortage-occupation list from the
// version-controlled config (config/personas.ts, config/shortageOccupations.ts).
// Was originally added as a one-time production seed (no Application Default
// Credentials were available to run scripts/seed.ts directly against prod on
// 2026-08-27); kept as a permanent admin panel action since re-seeding after
// a config change is a real recurring need.
export const adminSeedReferenceData = onCall(
  { secrets: [GEMINI_API_KEY] },
  async (request) => {
    if (!isAllowlisted(request.auth?.token.email)) {
      throw new HttpsError('permission-denied', 'Not authorized.');
    }
    return seedReferenceData(GEMINI_API_KEY.value());
  }
);
