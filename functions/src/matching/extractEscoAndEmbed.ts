import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { embedText, extractJobSignals } from '../lib/gemini';
import { lookupEscoSkillUris } from '../lib/esco';
import { SHORTAGE_OCCUPATIONS } from '../config/shortageOccupations';

const COLLECTIONS = { Vacancies: 'jobslu_vacancies' };

// Reads a vacancy's rawDescription, extracts skill labels + telework signals
// via Gemini, resolves the skill labels to real ESCO URIs, embeds the job
// text, and writes it all back onto the vacancy doc. Does not touch
// matchedPersona/matchScore/status — that's scoreMatch.ts's job.
export async function extractEscoAndEmbed(
  apiKey: string,
  jobId: string
): Promise<void> {
  const db = getFirestore();
  const docRef = db.collection(COLLECTIONS.Vacancies).doc(jobId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new Error(`Vacancy ${jobId} not found`);
  }
  const vacancy = snapshot.data() as {
    title: string;
    rawDescription: string;
    location: Record<string, unknown>;
  };

  const signals = await extractJobSignals(
    apiKey,
    vacancy.title,
    vacancy.rawDescription,
    SHORTAGE_OCCUPATIONS.map((o) => o.titleFr)
  );
  const escoUris = await lookupEscoSkillUris(signals.skillLabels);
  const embedding = await embedText(
    apiKey,
    `${vacancy.title}\n\n${vacancy.rawDescription}`.slice(0, 8000)
  );

  await docRef.update({
    extractedSkills: escoUris,
    extractedSkillLabels: signals.skillLabels,
    'location.allowsTelework': signals.allowsTelework,
    'location.teleworkPercentageMax': signals.teleworkPercentageMax,
    shortageOccupationMatch: signals.shortageOccupationMatch,
    applicationDeadline: signals.applicationDeadline
      ? Timestamp.fromDate(new Date(signals.applicationDeadline))
      : null,
    embedding: FieldValue.vector(embedding),
  });

  logger.info('extractEscoAndEmbed complete', {
    jobId,
    skillCount: escoUris.length,
    allowsTelework: signals.allowsTelework,
    shortageOccupationMatch: signals.shortageOccupationMatch,
  });
}
