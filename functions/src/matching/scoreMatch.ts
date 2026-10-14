import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { cosineSimilarity } from '../lib/vectorMath';
import { PersonaId } from '../config/personas';

const COLLECTIONS = {
  Vacancies: 'jobslu_vacancies',
  Personas: 'jobslu_personas',
  // The embedding vector lives in its own collection (not on the vacancy doc)
  // so the client never downloads it — see extractEscoAndEmbed.ts.
  VacancyEmbeddings: 'jobslu_vacancy_embeddings',
};

// Only two fixed personas, so an in-memory nearest-neighbor comparison is
// simpler and easier to verify than standing up a Firestore findNearest()
// query for a 2-candidate set. The vector index on
// jobslu_vacancy_embeddings.embedding (firestore.indexes.json) is kept for a
// possible future "search vacancies by free-text query" feature, not used here.
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
  // Pre-migration docs stored the embedding inline as a plain array.
  if (Array.isArray(value) && value.every((n) => typeof n === 'number')) {
    return value as number[];
  }
  return null;
}

// Reads a vacancy's embedding from its sibling jobslu_vacancy_embeddings doc,
// falling back to an inline `embedding` field on the vacancy doc itself for
// vacancies embedded before the field was moved off-document.
async function readVacancyEmbedding(
  db: FirebaseFirestore.Firestore,
  jobId: string,
  inlineFallback: unknown
): Promise<number[] | null> {
  const embSnap = await db.collection(COLLECTIONS.VacancyEmbeddings).doc(jobId).get();
  const fromSibling = toVectorArray(embSnap.data()?.['embedding']);
  if (fromSibling) {
    return fromSibling;
  }
  return toVectorArray(inlineFallback);
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
  const vacancyVector = await readVacancyEmbedding(db, jobId, vacancy.embedding);
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

  const hasShortage = Boolean(vacancy.shortageOccupationMatch);
  const matchScores: Partial<Record<PersonaId, number>> = {};
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
    // Shortage-occupation boost is persona-independent, so apply it to every
    // persona's score (not only the winner's). It still can't change which
    // persona is "best" since it shifts all scores equally.
    const boosted = hasShortage
      ? Math.min(1, similarity + SHORTAGE_OCCUPATION_BOOST)
      : similarity;
    matchScores[persona.personaId] = boosted;
    if (boosted > bestScore) {
      bestScore = boosted;
      bestPersona = persona.personaId;
    }
  }

  if (!bestPersona) {
    throw new Error('No persona had a usable embedding to compare against');
  }

  await vacancyRef.update({
    matchedPersona: bestPersona,
    matchScore: bestScore,
    matchScores,
    matchedAt: FieldValue.serverTimestamp(),
    status: 'matched',
  });

  logger.info('scoreMatch complete', {
    jobId,
    matchedPersona: bestPersona,
    matchScore: bestScore,
    matchScores,
    shortageBoosted: hasShortage,
  });
}
