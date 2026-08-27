import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GEMINI_API_KEY } from '../config/secrets';
import { isAllowlisted } from '../config/allowlist';
import { embedText } from '../lib/gemini';
import { personaEmbeddingText } from '../lib/personaEmbeddingText';
import { CvBullet, Persona, PersonaId } from '../config/personas';

const COLLECTIONS = { Personas: 'jobslu_personas' };

interface UpdatePersonaCvBulletsRequest {
  personaId: PersonaId;
  cvBullets: CvBullet[];
}

function isValidCvBullet(value: unknown): value is CvBullet {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const bullet = value as Record<string, unknown>;
  return (
    typeof bullet['id'] === 'string' &&
    bullet['id'].trim().length > 0 &&
    typeof bullet['text'] === 'string' &&
    bullet['text'].trim().length > 0 &&
    Array.isArray(bullet['tags']) &&
    bullet['tags'].every((t) => typeof t === 'string')
  );
}

// Replaces functions/src/config/personas.ts's hardcoded cvBullets as the way
// to edit CV content — this writes straight to Firestore, so
// documents/generateApplication.ts (which already reads the persona doc, not
// the static config) picks up changes immediately with no redeploy.
// Regenerates the embedding on save for the same reason
// adminUpdatePersonaDomains does: personaEmbeddingText.ts folds cvBullets
// text into the vector matching/scoreMatch.ts compares jobs against.
export const adminUpdatePersonaCvBullets = onCall(
  { secrets: [GEMINI_API_KEY] },
  async (request) => {
    if (!isAllowlisted(request.auth?.token.email)) {
      throw new HttpsError('permission-denied', 'Not authorized.');
    }

    const { personaId, cvBullets } = request.data as UpdatePersonaCvBulletsRequest;
    if (
      (personaId !== 'philip' && personaId !== 'chiara') ||
      !Array.isArray(cvBullets) ||
      !cvBullets.every(isValidCvBullet)
    ) {
      throw new HttpsError(
        'invalid-argument',
        'Expected { personaId, cvBullets: { id: string, text: string, tags: string[] }[] }.'
      );
    }
    const cleanBullets = cvBullets.map((b) => ({
      id: b.id.trim(),
      text: b.text.trim(),
      tags: b.tags.map((t) => t.trim()).filter(Boolean),
    }));
    if (cleanBullets.length === 0) {
      throw new HttpsError('invalid-argument', 'cvBullets must have at least one entry.');
    }
    const ids = new Set(cleanBullets.map((b) => b.id));
    if (ids.size !== cleanBullets.length) {
      throw new HttpsError('invalid-argument', 'cvBullets ids must be unique.');
    }

    const db = getFirestore();
    const ref = db.collection(COLLECTIONS.Personas).doc(personaId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      throw new HttpsError('not-found', `Persona ${personaId} not found.`);
    }
    const persona = snapshot.data() as Persona;

    const updated = { ...persona, cvBullets: cleanBullets };
    const embedding = await embedText(GEMINI_API_KEY.value(), personaEmbeddingText(updated));

    await ref.update({
      cvBullets: cleanBullets,
      embedding: FieldValue.vector(embedding),
    });

    return { personaId, cvBullets: cleanBullets };
  }
);
