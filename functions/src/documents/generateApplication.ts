import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { generateApplication as callGemini } from '../lib/gemini';
import { PersonaId, Persona } from '../config/personas';
import { JobApplication } from '../models/application';

const COLLECTIONS = {
  Vacancies: 'jobslu_vacancies',
  Personas: 'jobslu_personas',
  Applications: 'jobslu_applications',
};

const AUTO_APPLICATION_THRESHOLD = 0.85;

// Triggered when a vacancy's matchScore crosses AUTO_APPLICATION_THRESHOLD.
// Idempotent: skips if an application already exists for this job.
export async function generateApplicationForJob(
  apiKey: string,
  jobId: string
): Promise<void> {
  const db = getFirestore();

  const applicationRef = db.collection(COLLECTIONS.Applications).doc(jobId);
  if ((await applicationRef.get()).exists) {
    logger.info('Application already exists, skipping', { jobId });
    return;
  }

  const vacancyRef = db.collection(COLLECTIONS.Vacancies).doc(jobId);
  const vacancySnap = await vacancyRef.get();
  if (!vacancySnap.exists) {
    throw new Error(`Vacancy ${jobId} not found`);
  }
  const vacancy = vacancySnap.data() as {
    title: string;
    employer: string;
    rawDescription: string;
    matchedPersona: PersonaId | null;
    matchScore: number | null;
  };

  if (!vacancy.matchedPersona || (vacancy.matchScore ?? 0) < AUTO_APPLICATION_THRESHOLD) {
    logger.info('Vacancy below auto-application threshold, skipping', {
      jobId,
      matchScore: vacancy.matchScore,
    });
    return;
  }

  const personaSnap = await db
    .collection(COLLECTIONS.Personas)
    .doc(vacancy.matchedPersona)
    .get();
  if (!personaSnap.exists) {
    throw new Error(`Persona ${vacancy.matchedPersona} not found`);
  }
  const persona = personaSnap.data() as Persona;

  const generated = await callGemini(apiKey, {
    candidateName: persona.displayName,
    jobTitle: vacancy.title,
    employer: vacancy.employer,
    jobDescription: vacancy.rawDescription,
    cvBullets: persona.cvBullets.map((b) => ({ id: b.id, text: b.text })),
  });

  const application: JobApplication = {
    applicationId: jobId,
    jobId,
    persona: vacancy.matchedPersona,
    generatedCoverLetter: generated.coverLetter,
    reorderedCvBullets: generated.reorderedCvBulletIds,
    generationRationale: generated.generationRationale,
    status: 'draft',
    statusHistory: [{ status: 'draft', changedAt: Timestamp.now(), note: null }],
    createdAt: FieldValue.serverTimestamp(),
  };

  await applicationRef.set(application);
  await vacancyRef.update({ status: 'applied' });

  logger.info('generateApplicationForJob complete', {
    jobId,
    persona: vacancy.matchedPersona,
  });
}
