import { onSchedule } from 'firebase-functions/v2/scheduler';
import { GEMINI_API_KEY, APIFY_TOKEN } from '../config/secrets';
import { runIngestion } from './orchestrator';

export const dailyIngestion = onSchedule(
  {
    schedule: 'every day 06:00',
    timeZone: 'Europe/Luxembourg',
    secrets: [GEMINI_API_KEY, APIFY_TOKEN],
    // 10 DIRECT_FETCH_SOURCES + up to MAX_TOTAL_MATCHES_PER_RUN (120) real
    // Gemini calls in orchestrator.ts can approach 540s even with that cap
    // in place — a killed-mid-execution timeout surfaces to the admin panel
    // as an opaque "internal" error rather than a clean failure, which is
    // worse than just letting it run longer. 2nd-gen functions support up
    // to 3600s; 900s is a comfortable margin over the realistic worst case.
    timeoutSeconds: 900,
    memory: '512MiB',
  },
  async () => {
    await runIngestion(GEMINI_API_KEY.value(), APIFY_TOKEN.value() || undefined);
  }
);
