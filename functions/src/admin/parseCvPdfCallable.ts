import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GEMINI_API_KEY } from '../config/secrets';
import { isAllowlisted } from '../config/allowlist';
import { extractCvBulletsFromPdf } from '../lib/gemini';
import { PersonaId } from '../config/personas';

interface ParseCvPdfRequest {
  personaId: PersonaId;
  storagePath: string;
}

// Matches the rule enforced in storage.rules for jobslu/cv-uploads/.
const MAX_PDF_BYTES = 15 * 1024 * 1024;

// Reads an already-uploaded PDF from Storage (see storage.rules'
// jobslu/cv-uploads/{personaId}/ path) and returns Gemini-extracted CV
// bullets as a DRAFT — this never writes to Firestore itself. The admin
// panel loads the result into the same CV Content editor draft that manual
// edits use, so a human reviews/edits before adminUpdatePersonaCvBullets
// actually saves anything.
export const adminParseCvPdf = onCall(
  { secrets: [GEMINI_API_KEY], timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!isAllowlisted(request.auth?.token.email)) {
      throw new HttpsError('permission-denied', 'Not authorized.');
    }

    const { personaId, storagePath } = request.data as ParseCvPdfRequest;
    if (
      (personaId !== 'philip' && personaId !== 'chiara') ||
      typeof storagePath !== 'string' ||
      !storagePath.startsWith(`jobslu/cv-uploads/${personaId}/`)
    ) {
      throw new HttpsError(
        'invalid-argument',
        "Expected { personaId, storagePath } with storagePath under that persona's jobslu/cv-uploads/ folder."
      );
    }

    const file = getStorage().bucket().file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new HttpsError('not-found', `No file at ${storagePath}.`);
    }
    const [metadata] = await file.getMetadata();
    if (metadata.contentType !== 'application/pdf') {
      throw new HttpsError('invalid-argument', 'Uploaded file must be a PDF.');
    }
    if (Number(metadata.size) > MAX_PDF_BYTES) {
      throw new HttpsError('invalid-argument', 'PDF is too large (max 15MB).');
    }

    const [buffer] = await file.download();
    const bullets = await extractCvBulletsFromPdf(GEMINI_API_KEY.value(), buffer.toString('base64'));
    if (bullets.length === 0) {
      throw new HttpsError(
        'failed-precondition',
        'Could not extract any CV content from this PDF — it may be scanned/image-based rather than text-based.'
      );
    }

    return { personaId, bullets };
  }
);
