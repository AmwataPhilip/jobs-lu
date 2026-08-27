import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { PERSONAS } from '../config/personas';
import { SHORTAGE_OCCUPATIONS } from '../config/shortageOccupations';
import { embedText } from '../lib/gemini';
import { personaEmbeddingText } from '../lib/personaEmbeddingText';

const COLLECTIONS = {
  Personas: 'jobslu_personas',
  ShortageOccupations: 'jobslu_shortage_occupations',
};

const COMBINING_DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g');

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Shared by scripts/seed.ts (manual/emulator use) and admin/seedCallable.ts.
export async function seedReferenceData(geminiApiKey: string | undefined): Promise<{
  personaCount: number;
  shortageOccupationCount: number;
  embeddingsWritten: boolean;
}> {
  const db = getFirestore();
  const batch = db.batch();

  for (const persona of Object.values(PERSONAS)) {
    const ref = db.collection(COLLECTIONS.Personas).doc(persona.personaId);
    if (geminiApiKey) {
      const embedding = await embedText(geminiApiKey, personaEmbeddingText(persona));
      batch.set(ref, { ...persona, embedding: FieldValue.vector(embedding) }, { merge: true });
    } else {
      batch.set(ref, persona, { merge: true });
    }
  }

  for (const occupation of SHORTAGE_OCCUPATIONS) {
    const docId = occupation.occupationCode ?? slugify(occupation.titleFr);
    const ref = db.collection(COLLECTIONS.ShortageOccupations).doc(docId);
    batch.set(ref, occupation, { merge: true });
  }

  await batch.commit();

  return {
    personaCount: Object.keys(PERSONAS).length,
    shortageOccupationCount: SHORTAGE_OCCUPATIONS.length,
    embeddingsWritten: Boolean(geminiApiKey),
  };
}
