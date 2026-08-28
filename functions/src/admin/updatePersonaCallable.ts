import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GEMINI_API_KEY } from '../config/secrets';
import { isAllowlisted } from '../config/allowlist';
import { embedText } from '../lib/gemini';
import { personaEmbeddingText } from '../lib/personaEmbeddingText';
import { Persona, PersonaId } from '../config/personas';

const COLLECTIONS = { Personas: 'jobslu_personas' };

interface UpdatePersonaTargetingRequest {
  personaId: PersonaId;
  domains: string[];
  coreSkills: string[];
  targetRoles: string[];
  // Display-only for now — not part of personaEmbeddingText() and not read
  // by matching/relevanceRanking.ts. Still editable here (rather than only
  // domains/coreSkills/targetRoles) so the whole "Target Roles &
  // Specializations / Target Institutions / Core Skills" card on the
  // Profiles page is editable from one place, not just the fields that
  // happen to feed the embedding today.
  targetInstitutions: string[];
}

function cleanStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    return null;
  }
  return value.map((v) => v.trim()).filter(Boolean);
}

// Lets the admin panel edit a persona's target domains/skills/roles and
// regenerates its embedding to match — matching/scoreMatch.ts compares
// against this embedding, so it must stay in sync with whatever's
// displayed/edited. targetInstitutions doesn't affect the embedding (see
// personaEmbeddingText.ts) but is saved alongside the others since it's part
// of the same editable profile card.
export const adminUpdatePersonaTargeting = onCall(
  { secrets: [GEMINI_API_KEY] },
  async (request) => {
    if (!isAllowlisted(request.auth?.token.email)) {
      throw new HttpsError('permission-denied', 'Not authorized.');
    }

    const data = request.data as UpdatePersonaTargetingRequest;
    if (data.personaId !== 'philip' && data.personaId !== 'chiara') {
      throw new HttpsError('invalid-argument', 'Expected personaId to be "philip" or "chiara".');
    }

    const domains = cleanStringArray(data.domains);
    const coreSkills = cleanStringArray(data.coreSkills);
    const targetRoles = cleanStringArray(data.targetRoles);
    const targetInstitutions = cleanStringArray(data.targetInstitutions);
    if (!domains || !coreSkills || !targetRoles || !targetInstitutions) {
      throw new HttpsError(
        'invalid-argument',
        'Expected { personaId, domains, coreSkills, targetRoles, targetInstitutions } as string[].'
      );
    }
    if (domains.length === 0) {
      throw new HttpsError('invalid-argument', 'domains must have at least one entry.');
    }

    const db = getFirestore();
    const ref = db.collection(COLLECTIONS.Personas).doc(data.personaId);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      throw new HttpsError('not-found', `Persona ${data.personaId} not found.`);
    }
    const persona = snapshot.data() as Persona;

    const updated: Persona = { ...persona, domains, coreSkills, targetRoles, targetInstitutions };
    const embedding = await embedText(GEMINI_API_KEY.value(), personaEmbeddingText(updated));

    await ref.update({
      domains,
      coreSkills,
      targetRoles,
      targetInstitutions,
      embedding: FieldValue.vector(embedding),
    });

    return { personaId: data.personaId, domains, coreSkills, targetRoles, targetInstitutions };
  }
);
