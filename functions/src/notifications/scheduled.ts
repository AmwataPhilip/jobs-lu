import { onSchedule } from 'firebase-functions/v2/scheduler';
import { RESEND_API_KEY } from '../config/secrets';
import { sendDailyDigest } from './sendDigest';

export const dailyReminderDigest = onSchedule(
  {
    schedule: 'every day 08:00',
    timeZone: 'Europe/Luxembourg',
    secrets: [RESEND_API_KEY],
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async () => {
    await sendDailyDigest(RESEND_API_KEY.value() || undefined);
  }
);
