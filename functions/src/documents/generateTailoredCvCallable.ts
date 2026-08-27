import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GEMINI_API_KEY } from '../config/secrets';
import { isAllowlisted } from '../config/allowlist';
import { generateTailoredCvContent } from '../lib/gemini';
import { renderCvPdf } from './renderCvPdf';
import { Persona, PersonaId } from '../config/personas';

const COLLECTIONS = { Vacancies: 'jobslu_vacancies', Personas: 'jobslu_personas' };

interface GenerateTailoredCvRequest {
  jobId: string;
  personaId: PersonaId;
  language: string;
}

// Builds a job-specific, language-specific, Europass-inspired CV PDF from a
// persona's real CV Content — Gemini selects/reorders/translates the most
// relevant bullets (never inventing new ones), renderCvPdf.ts lays it out.
// Returns the PDF as base64 rather than writing to Storage: it's a
// throwaway, regenerate-on-demand artifact (no history/tracking need), so
// skipping Storage avoids a whole extra rules path for something the client
// downloads once and discards.
export const generateTailoredCv = onCall(
  { secrets: [GEMINI_API_KEY], timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!isAllowlisted(request.auth?.token.email)) {
      throw new HttpsError('permission-denied', 'Not authorized.');
    }

    const { jobId, personaId, language } = request.data as GenerateTailoredCvRequest;
    if (
      typeof jobId !== 'string' ||
      !jobId ||
      (personaId !== 'philip' && personaId !== 'chiara') ||
      typeof language !== 'string' ||
      !language.trim()
    ) {
      throw new HttpsError('invalid-argument', 'Expected { jobId, personaId, language }.');
    }

    const db = getFirestore();
    const [vacancySnap, personaSnap] = await Promise.all([
      db.collection(COLLECTIONS.Vacancies).doc(jobId).get(),
      db.collection(COLLECTIONS.Personas).doc(personaId).get(),
    ]);
    if (!vacancySnap.exists) {
      throw new HttpsError('not-found', `Vacancy ${jobId} not found.`);
    }
    if (!personaSnap.exists) {
      throw new HttpsError('not-found', `Persona ${personaId} not found.`);
    }
    const vacancy = vacancySnap.data() as { title: string; employer: string; rawDescription: string };
    const persona = personaSnap.data() as Persona;

    if (!persona.cvBullets || persona.cvBullets.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'This persona has no CV content yet — add some in the admin panel first.'
      );
    }

    const tailored = await generateTailoredCvContent(GEMINI_API_KEY.value(), {
      candidateName: persona.displayName,
      jobTitle: vacancy.title,
      employer: vacancy.employer,
      jobDescription: vacancy.rawDescription,
      language,
      cvBullets: persona.cvBullets.map((b) => ({ text: b.text, employer: b.employer, period: b.period })),
    });

    const pdfBytes = await renderCvPdf({
      candidateName: persona.displayName,
      contactEmail: persona.contactEmail,
      jobTitle: vacancy.title,
      employer: vacancy.employer,
      professionalSummary: tailored.professionalSummary,
      bullets: tailored.bullets,
      skills: persona.coreSkills,
      language,
    });

    const safeEmployer = vacancy.employer.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '');
    const safeName = persona.displayName.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '');

    return {
      jobId,
      personaId,
      language,
      fileName: `${safeName}-CV-${safeEmployer}.pdf`,
      pdfBase64: Buffer.from(pdfBytes).toString('base64'),
    };
  }
);
