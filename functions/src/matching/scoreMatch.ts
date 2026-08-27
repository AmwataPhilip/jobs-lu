import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { cosineSimilarity } from '../lib/vectorMath';
import { PersonaId } from '../config/personas';

const COLLECTIONS = {
  Vacancies: 'jobslu_vacancies',
  Personas: 'jobslu_personas',
};

// Only two fixed personas, so an in-memory nearest-neighbor comparison is
// simpler and easier to verify than standing up a Firestore findNearest()
// query for a 2-candidate set. The vector index on jobslu_vacancies.embedding
// (firestore.indexes.json) is kept for a possible future "search vacancies
// by free-text query" feature, not used here.
const SHORTAGE_OCCUPATION_BOOST = 0.15;

interface VectorField {
  toArray(): number[];
}

function toVectorArray(value: unknown): number[] | null {
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as VectorField).toArray === 'function'
  ) {
    return (value as VectorField).toArray();
  }
  return null;
}

export async function scoreMatch(jobId: string): Promise<void> {
  const db = getFirestore();
  const vacancyRef = db.collection(COLLECTIONS.Vacancies).doc(jobId);
  const vacancySnap = await vacancyRef.get();
  if (!vacancySnap.exists) {
    throw new Error(`Vacancy ${jobId} not found`);
  }
  const vacancy = vacancySnap.data() as {
    embedding?: unknown;
    shortageOccupationMatch: string | null;
  };
  const vacancyVector = toVectorArray(vacancy.embedding);
  if (!vacancyVector) {
    throw new Error(
      `Vacancy ${jobId} has no embedding — run extractEscoAndEmbed first`
    );
  }

  const personasSnap = await db.collection(COLLECTIONS.Personas).get();
  if (personasSnap.empty) {
    throw new Error(
      'No personas found in jobslu_personas — run the seed script first'
    );
  }

  let bestPersona: PersonaId | null = null;
  let bestScore = -Infinity;

  for (const doc of personasSnap.docs) {
    const persona = doc.data() as { personaId: PersonaId; embedding?: unknown };
    const personaVector = toVectorArray(persona.embedding);
    if (!personaVector) {
      logger.warn('Persona has no embedding, skipping', {
        personaId: persona.personaId,
      });
      continue;
    }
    const similarity = Math.max(0, cosineSimilarity(vacancyVector, personaVector));
    if (similarity > bestScore) {
      bestScore = similarity;
      bestPersona = persona.personaId;
    }
  }

  if (!bestPersona) {
    throw new Error('No persona had a usable embedding to compare against');
  }

  const boosted = vacancy.shortageOccupationMatch
    ? Math.min(1, bestScore + SHORTAGE_OCCUPATION_BOOST)
    : bestScore;

  await vacancyRef.update({
    matchedPersona: bestPersona,
    matchScore: boosted,
    status: 'matched',
  });

  logger.info('scoreMatch complete', {
    jobId,
    matchedPersona: bestPersona,
    matchScore: boosted,
    shortageBoosted: Boolean(vacancy.shortageOccupationMatch),
  });
}
