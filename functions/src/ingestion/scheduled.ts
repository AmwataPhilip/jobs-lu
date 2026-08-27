import { onSchedule } from 'firebase-functions/v2/scheduler';
import { GEMINI_API_KEY, APIFY_TOKEN } from '../config/secrets';
import { runIngestion } from './orchestrator';

export const dailyIngestion = onSchedule(
  {
    schedule: 'every day 06:00',
    timeZone: 'Europe/Luxembourg',
    secrets: [GEMINI_API_KEY, APIFY_TOKEN],
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    await runIngestion(GEMINI_API_KEY.value(), APIFY_TOKEN.value() || undefined);
  }
);
