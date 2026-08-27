import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GEMINI_API_KEY, APIFY_TOKEN } from '../config/secrets';
import { isAllowlisted } from '../config/allowlist';
import { runIngestion } from '../ingestion/orchestrator';

// Manual trigger for the ingestion pipeline, callable from the admin panel
// instead of waiting for dailyIngestion's 6am schedule.
export const adminRunIngestion = onCall(
  { secrets: [GEMINI_API_KEY, APIFY_TOKEN], timeoutSeconds: 540, memory: '512MiB' },
  async (request) => {
    if (!isAllowlisted(request.auth?.token.email)) {
      throw new HttpsError('permission-denied', 'Not authorized.');
    }
    return runIngestion(GEMINI_API_KEY.value(), APIFY_TOKEN.value() || undefined);
  }
);
