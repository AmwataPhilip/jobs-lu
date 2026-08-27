import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { GEMINI_API_KEY } from '../config/secrets';
import { isAllowlisted } from '../config/allowlist';
import { extractEscoAndEmbed } from '../matching/extractEscoAndEmbed';
import { scoreMatch } from '../matching/scoreMatch';

const COLLECTIONS = { Vacancies: 'jobslu_vacancies' };

// Re-scores every already-embedded vacancy against CURRENT persona
// embeddings — no ingestion, no fetching, no Gemini calls (scoreMatch.ts is
// pure vector math over embeddings that already exist). This closes a real
// gap: editing CV content or domains (adminUpdatePersonaCvBullets /
// adminUpdatePersonaDomains) regenerates the PERSONA embedding but nothing
// previously re-scored already-matched VACANCIES against it — they stayed
// pinned to whatever score they got the day they were first matched. Being
// Gemini-free makes this cheap enough to run over the whole collection in
// one call, unlike ingestion's extraction stage.
export const adminRematchAll = onCall({ timeoutSeconds: 300, memory: '256MiB' }, async (request) => {
  if (!isAllowlisted(request.auth?.token.email)) {
    throw new HttpsError('permission-denied', 'Not authorized.');
  }

  const db = getFirestore();
  const snap = await db
    .collection(COLLECTIONS.Vacancies)
    .where('status', 'in', ['matched', 'applied', 'new'])
    .get();

  let rescored = 0;
  const errors: { jobId: string; message: string }[] = [];
  // Pure vector-math + a Firestore write per job — safe to run much wider
  // than the Gemini-bound MATCHING_CONCURRENCY used during ingestion.
  const CONCURRENCY = 20;
  const jobIds = snap.docs.map((doc) => doc.id);
  for (let i = 0; i < jobIds.length; i += CONCURRENCY) {
    const chunk = jobIds.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (jobId) => {
        try {
          await scoreMatch(jobId);
          rescored++;
        } catch (error) {
          // Vacancies still status:'new' with no embedding yet throw here —
          // expected, not an error worth surfacing prominently; ingestion's
          // extraction stage is what handles those.
          errors.push({ jobId, message: (error as Error).message });
        }
      })
    );
  }

  return { rescored, errorCount: errors.length, errors: errors.slice(0, 20) };
});

interface RematchJobRequest {
  jobId: string;
}

// Full re-extraction + re-score for a single vacancy, on demand — for when
// a specific match looks wrong and you want Gemini to take another pass at
// it (e.g. after noticing a bad shortage-occupation read) rather than
// waiting for ingestion's backlog sweep to get to it.
export const adminRematchJob = onCall({ secrets: [GEMINI_API_KEY], timeoutSeconds: 60 }, async (request) => {
  if (!isAllowlisted(request.auth?.token.email)) {
    throw new HttpsError('permission-denied', 'Not authorized.');
  }
  const { jobId } = request.data as RematchJobRequest;
  if (typeof jobId !== 'string' || !jobId) {
    throw new HttpsError('invalid-argument', 'Expected { jobId: string }.');
  }

  await extractEscoAndEmbed(GEMINI_API_KEY.value(), jobId);
  await scoreMatch(jobId);

  return { jobId, rematched: true };
});
