import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { Vacancy, VacancySource } from '../models/vacancy';

const COLLECTIONS = { Vacancies: 'jobslu_vacancies' };

// Deployed 2026-08-27 (functions/src/ingestion/fetchApifySource.ts) — reads
// moovijob.com's job listings via its embedded schema.org JobPosting JSON-LD.
// Source lives at /Users/philip/Workspace/Other/Philip Amwata/jobs-lu/apify-moovijob-scraper
// (not part of this repo — a separate Apify Actor project pushed via `apify push`).
//
// Currently disabled (actorId: null below): moovijob.com's Cloudflare
// protection fingerprints Playwright's browser automation itself — a
// residential proxy alone didn't get past it (verified 2026-08-27, see two
// real runs in Apify Console). The actor is built and deployed
// (id xihZIuCeaAUXKdhpx) but left disabled here rather than burning Apify
// compute on daily failed runs. Re-enable once it's rebuilt on the Camoufox
// (fingerprint-hardened) Crawlee template and verified working.
const MOOVIJOB_ACTOR_ID: string | null = null;

// jobs.lu is blocked by a harder, network-level Akamai WAF rule that a plain
// browser challenge doesn't clear — untested whether Apify's proxy gets
// through. Left null until that's verified with a real run.
export const APIFY_SOURCES: {
  sourceName: VacancySource;
  actorId: string | null;
}[] = [
  { sourceName: 'Moovijob', actorId: MOOVIJOB_ACTOR_ID },
  { sourceName: 'JobsLu', actorId: null },
];

interface MoovijobDatasetItem {
  sourceUrl: string;
  title: string | null;
  employer: string | null;
  city: string | null;
  country: string | null;
  rawDescriptionHtml: string;
  datePosted: string | null;
  employmentType: string[] | string | null;
  estimatedSalary: number | null;
}

function jobIdFromMoovijobUrl(sourceUrl: string): string {
  const path = sourceUrl.replace('https://en.moovijob.com/job-offers/', '');
  return `moovijob_${path.replace(/\//g, '_')}`;
}

async function runApifyActor(
  actorId: string,
  apifyToken: string,
  input: Record<string, unknown>
): Promise<MoovijobDatasetItem[]> {
  const response = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}&timeout=300`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
  if (!response.ok) {
    throw new Error(`Apify actor ${actorId} failed: HTTP ${response.status}`);
  }
  return (await response.json()) as MoovijobDatasetItem[];
}

async function ingestMoovijob(
  actorId: string,
  apifyToken: string,
  runId: string
): Promise<{ fetched: number; newJobIds: string[] }> {
  // Kept modest — this is a 2-user tool, not a full-catalog daily sync, and
  // browser-based Apify runs cost meaningfully more than plain HTTP fetches.
  // Duplicate jobs across days are deduped by jobId anyway (see below), so a
  // small daily slice still accumulates good coverage over time.
  const items = await runApifyActor(actorId, apifyToken, {
    startUrl: 'https://en.moovijob.com/job-offers/jobs-luxembourg',
    maxListPages: 2,
    maxRequestsPerCrawl: 60,
  });

  const db = getFirestore();
  const newJobIds: string[] = [];

  for (const item of items) {
    if (!item.title || !item.sourceUrl) {
      continue;
    }
    const jobId = jobIdFromMoovijobUrl(item.sourceUrl);
    const docRef = db.collection(COLLECTIONS.Vacancies).doc(jobId);
    const existing = await docRef.get();

    const sourceFields = {
      jobId,
      source: 'Moovijob' as const,
      externalId: item.sourceUrl,
      title: item.title,
      employer: item.employer || 'Not disclosed',
      location: {
        country: (item.country || 'LU').toUpperCase(),
        city: item.city ?? null,
      },
      rawDescription: item.rawDescriptionHtml ?? '',
      estimatedSalary: item.estimatedSalary,
      ingestedAt: FieldValue.serverTimestamp(),
      ingestionRunId: runId,
    };

    if (existing.exists) {
      await docRef.set(sourceFields, { merge: true });
    } else {
      const vacancy: Vacancy = {
        ...sourceFields,
        location: {
          ...sourceFields.location,
          // Moovijob doesn't expose a structured telework field either —
          // refined from rawDescription by extractEscoAndEmbed.ts.
          allowsTelework: false,
          teleworkPercentageMax: 0,
        },
        extractedSkills: [],
        extractedSkillLabels: [],
        shortageOccupationMatch: null,
        matchedPersona: null,
        matchScore: null,
        postedAt:
          item.datePosted && !Number.isNaN(Date.parse(item.datePosted))
            ? Timestamp.fromDate(new Date(item.datePosted))
            : null,
        applicationDeadline: null,
        status: 'new',
      };
      await docRef.set(vacancy);
      newJobIds.push(jobId);
    }
  }

  return { fetched: items.length, newJobIds };
}

export async function fetchApifySource(
  sourceName: VacancySource,
  actorId: string | null,
  apifyToken: string | undefined,
  runId: string
): Promise<{ fetched: number; newJobIds: string[]; skipped: boolean; reason?: string }> {
  if (!apifyToken) {
    logger.warn('Skipping Apify source: APIFY_TOKEN not configured', { sourceName });
    return { fetched: 0, newJobIds: [], skipped: true, reason: 'APIFY_TOKEN not configured' };
  }
  if (!actorId) {
    logger.warn('Skipping Apify source: no actor ID configured', { sourceName });
    return { fetched: 0, newJobIds: [], skipped: true, reason: 'No actor ID configured' };
  }

  if (sourceName === 'Moovijob') {
    const result = await ingestMoovijob(actorId, apifyToken, runId);
    logger.info('fetchApifySource complete', { sourceName, ...result });
    return { ...result, skipped: false };
  }

  logger.warn('Skipping Apify source: no ingestion mapping implemented', { sourceName });
  return { fetched: 0, newJobIds: [], skipped: true, reason: `No ingestion mapping for ${sourceName}` };
}
