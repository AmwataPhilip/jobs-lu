import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { GEMINI_API_KEY } from '../config/secrets';
import { generateApplicationForJob } from './generateApplication';

const AUTO_APPLICATION_THRESHOLD = 0.85;

export const autoGenerateApplication = onDocumentUpdated(
  {
    document: 'jobslu_vacancies/{jobId}',
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 120,
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) {
      return;
    }

    const beforeScore = before['matchScore'] ?? -Infinity;
    const afterScore = after['matchScore'] ?? -Infinity;
    const crossedThreshold =
      beforeScore < AUTO_APPLICATION_THRESHOLD &&
      afterScore >= AUTO_APPLICATION_THRESHOLD;

    if (!crossedThreshold) {
      return;
    }

    try {
      await generateApplicationForJob(GEMINI_API_KEY.value(), event.params.jobId);
    } catch (error) {
      logger.error('autoGenerateApplication failed', {
        jobId: event.params.jobId,
        error: (error as Error).message,
      });
    }
  }
);
