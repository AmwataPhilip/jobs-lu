import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { fetchEuresJobs } from './fetchEuresJobs';
import { fetchSiliconLuxembourgJobs } from './fetchSiliconLuxembourgJobs';
import { APIFY_SOURCES, fetchApifySource } from './fetchApifySource';
import { extractEscoAndEmbed } from '../matching/extractEscoAndEmbed';
import { scoreMatch } from '../matching/scoreMatch';

const COLLECTIONS = { IngestionRuns: 'jobslu_ingestion_runs', Vacancies: 'jobslu_vacancies' };

interface IngestionRunResult {
  runId: string;
  status: 'success' | 'partial' | 'failed';
  jobsFetched: number;
  jobsNew: number;
  jobsRetried: number;
  jobsMatched: number;
  sourcesSkipped: { source: string; reason: string }[];
  errors: { source: string; message: string }[];
}

// Plain HTTP + HTML-parsing sources (no bot protection, no Apify needed) —
// each returns the same shape as fetchEuresJobs.
//
// fetchUniLuJobs.ts is NOT wired in here: uni.lu turned out to be behind AWS
// WAF Bot Control (a JS challenge returning HTTP 202 + no content to plain
// HTTP clients) — a real browser masked this during manual inspection.
// Verified 2026-08-27. Would need the same Apify/headless-browser treatment
// as moovijob.com to actually work; left unwired to avoid shipping a source
// that silently fetches nothing every day.
const DIRECT_FETCH_SOURCES: {
  sourceName: string;
  fetch: (runId: string) => Promise<{ fetched: number; newJobIds: string[]; errors: string[] }>;
}[] = [
  { sourceName: 'EURES', fetch: fetchEuresJobs },
  { sourceName: 'SiliconLuxembourg', fetch: fetchSiliconLuxembourgJobs },
];

export async function runIngestion(
  geminiApiKey: string,
  apifyToken: string | undefined
): Promise<IngestionRunResult> {
  const db = getFirestore();
  const runRef = db.collection(COLLECTIONS.IngestionRuns).doc();
  const runId = runRef.id;

  await runRef.set({
    runId,
    startedAt: FieldValue.serverTimestamp(),
    completedAt: null,
    sourcesAttempted: [
      ...DIRECT_FETCH_SOURCES.map((s) => s.sourceName),
      ...APIFY_SOURCES.map((s) => s.sourceName),
    ],
    sourcesSkipped: [],
    jobsFetched: 0,
    jobsNew: 0,
    jobsRetried: 0,
    jobsMatched: 0,
    errors: [],
    status: 'running',
  });

  const errors: { source: string; message: string }[] = [];
  const sourcesSkipped: { source: string; reason: string }[] = [];
  let jobsFetched = 0;
  let jobsNew = 0;
  let jobsMatched = 0;
  const newJobIds: string[] = [];

  for (const { sourceName, fetch } of DIRECT_FETCH_SOURCES) {
    try {
      const result = await fetch(runId);
      jobsFetched += result.fetched;
      jobsNew += result.newJobIds.length;
      newJobIds.push(...result.newJobIds);
      for (const message of result.errors) {
        errors.push({ source: sourceName, message });
      }
    } catch (error) {
      errors.push({ source: sourceName, message: (error as Error).message });
    }
  }

  for (const { sourceName, actorId } of APIFY_SOURCES) {
    try {
      const result = await fetchApifySource(sourceName, actorId, apifyToken, runId);
      jobsFetched += result.fetched;
      jobsNew += result.newJobIds.length;
      newJobIds.push(...result.newJobIds);
      if (result.skipped && result.reason) {
        sourcesSkipped.push({ source: sourceName, reason: result.reason });
      }
    } catch (error) {
      errors.push({ source: sourceName, message: (error as Error).message });
    }
  }

  // Re-ingesting a source treats an already-existing vacancy doc as "seen,
  // skip" (see fetchEuresJobs.ts's existence pre-check) — so a job that
  // failed extraction/matching once (a Gemini rate limit, a transient error)
  // would otherwise stay at status:'new' forever, only ever fetched, never
  // retried, and invisible on the dashboard (which only shows 'matched'/
  // 'applied'). Sweep for anything still stuck at 'new' and retry it here
  // alongside this run's genuinely new jobs.
  const stalledSnap = await db
    .collection(COLLECTIONS.Vacancies)
    .where('status', '==', 'new')
    .get();
  const stalledJobIds = stalledSnap.docs
    .map((doc) => doc.id)
    .filter((jobId) => !newJobIds.includes(jobId));
  const jobIdsToMatch = [...newJobIds, ...stalledJobIds];

  const MATCHING_CONCURRENCY = 5;
  for (let i = 0; i < jobIdsToMatch.length; i += MATCHING_CONCURRENCY) {
    const chunk = jobIdsToMatch.slice(i, i + MATCHING_CONCURRENCY);
    await Promise.all(
      chunk.map(async (jobId) => {
        try {
          await extractEscoAndEmbed(geminiApiKey, jobId);
          await scoreMatch(jobId);
          jobsMatched++;
        } catch (error) {
          errors.push({
            source: `matching:${jobId}`,
            message: (error as Error).message,
          });
        }
      })
    );
  }

  const status: IngestionRunResult['status'] =
    errors.length === 0 ? 'success' : jobsFetched > 0 ? 'partial' : 'failed';

  await runRef.update({
    completedAt: FieldValue.serverTimestamp(),
    sourcesSkipped,
    jobsFetched,
    jobsNew,
    jobsRetried: stalledJobIds.length,
    jobsMatched,
    errors,
    status,
  });

  logger.info('Ingestion run complete', {
    runId,
    status,
    jobsFetched,
    jobsNew,
    jobsRetried: stalledJobIds.length,
    jobsMatched,
    errorCount: errors.length,
    skippedCount: sourcesSkipped.length,
  });

  return {
    runId,
    status,
    jobsFetched,
    jobsNew,
    jobsRetried: stalledJobIds.length,
    jobsMatched,
    sourcesSkipped,
    errors,
  };
}
