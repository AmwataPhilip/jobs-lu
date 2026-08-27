import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GEMINI_API_KEY } from '../config/secrets';
import { isAllowlisted } from '../config/allowlist';
import { embedText } from '../lib/gemini';
import { personaEmbeddingText } from '../lib/personaEmbeddingText';
import { Persona, PersonaId } from '../config/personas';

const COLLECTIONS = { Personas: 'jobslu_personas' };

interface UpdatePersonaDomainsRequest {
  personaId: PersonaId;
  domains: string[];
}

// Lets the admin panel edit a persona's target domains and regenerates its
// embedding to match — matching/scoreMatch.ts compares against this
// embedding, so it must stay in sync with whatever's displayed/edited.
export const adminUpdatePersonaDomains = onCall(
  { secrets: [GEMINI_API_KEY] },
  async (request) => {
    if (!isAllowlisted(request.auth?.token.email)) {
      throw new HttpsError('permission-denied', 'Not authorized.');
    }

    const { personaId, domains } = request.data as UpdatePersonaDomainsRequest;
    if (
      (personaId !== 'philip' && personaId !== 'chiara') ||
      !Array.isArray(domains) ||
      domains.some((d) => typeof d !== 'string')
    ) {
      throw new HttpsError('invalid-argument', 'Expected { personaId, domains: string[] }.');
    }
    const cleanDomains = domains.map((d) => d.trim()).filter(Boolean);
    if (cleanDomains.length === 0) {
      throw new HttpsError('invalid-argument', 'domains must have at least one entry.');
    }

    const db = getFirestore();
    const ref = db.collection(COLLECTIONS.Personas).doc(personaId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      throw new HttpsError('not-found', `Persona ${personaId} not found.`);
    }
    const persona = snapshot.data() as Persona;

    const updated = { ...persona, domains: cleanDomains };
    const embedding = await embedText(GEMINI_API_KEY.value(), personaEmbeddingText(updated));

    await ref.update({
      domains: cleanDomains,
      embedding: FieldValue.vector(embedding),
    });

    return { personaId, domains: cleanDomains };
  }
);
