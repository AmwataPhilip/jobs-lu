import { defineSecret } from 'firebase-functions/params';

// Prefixed JOBSLU_ because this project is shared with other repos —
// l-tz-drill already owns a secret literally named GEMINI_API_KEY, and
// sharing that name would mean whichever app redeploys last without
// explicitly pinning a secret version silently takes over the other's key.
//
// Set via: firebase functions:secrets:set JOBSLU_GEMINI_API_KEY
// Never committed, never placed in the client-bundled environment.ts.
export const GEMINI_API_KEY = defineSecret('JOBSLU_GEMINI_API_KEY');

// Not yet available — functions/src/ingestion/fetchApifySource.ts checks
// for this at runtime and skips gracefully if unset (M7).
export const APIFY_TOKEN = defineSecret('JOBSLU_APIFY_TOKEN');

// Set via: firebase functions:secrets:set JOBSLU_RESEND_API_KEY
// Used by functions/src/notifications/sendDigest.ts to email daily match & deadline digests.
export const RESEND_API_KEY = defineSecret('JOBSLU_RESEND_API_KEY');

