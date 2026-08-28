import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { Vacancy } from '../models/vacancy';
import { sortByTitleRelevance } from './relevanceRanking';

const SEARCH_URL = 'https://jobfinder.lu/en/jobs';
const DETAIL_URL_BASE = 'https://jobfinder.lu/en/jobs';
const USER_AGENT =
  'Mozilla/5.0 (compatible; EUWorkMeBot/1.0; +https://eu-workme.web.app)';

// jobfinder.lu is a Next.js app with no bot protection and no formal API, but
// every page embeds a complete JSON payload in a <script id="__NEXT_DATA__">
// tag — a plain HTTP GET returns the same data a browser would render with,
// no headless browser needed. See docs/JOB_SOURCE_INGESTION_STRATEGY.md.
//
// Verified live 2026-08-28: the search page's own ?page=N / offset / limit
// query params do NOT change what's returned server-side — every page fetch
// (including via the internal /_next/data/<buildId>/... endpoint) comes back
// with the same first ~20-40 results, sorted most-recent-first by default
// (queryKey sort:'date'). Rather than reverse-engineer whatever undocumented
// client-side API actually powers "load more" (fragile, could change any
// time with no notice), this only ever fetches that single most-recent page.
// New listings still get picked up reliably run over run — they're what
// "most recent" surfaces — at the cost of never backfilling jobfinder.lu's
// older inventory. That's an accepted, documented trade-off for a Tier 1
// quick-win source, not an oversight.
const MAX_NEW_JOBS_PER_RUN = 40;
const DETAIL_FETCH_CONCURRENCY = 5;

const COLLECTIONS = { Vacancies: 'jobslu_vacancies' };

interface JobfinderSearchOffer {
  offer: { id: string; title: Record<string, string> };
  company: { name: string };
}

interface JobfinderSearchData {
  offers: JobfinderSearchOffer[];
}

interface JobfinderDetailData {
  offer: {
    id: string;
    job: { title: Record<string, string>; description: Record<string, string> };
    visible_online: string | null;
    apply_before: string | null;
  };
  company: {
    name: string;
    contact: { address: { city: string | null; country: string | null } | null } | null;
  };
}

function pickLocalizedText(text: Record<string, string> | undefined): string {
  if (!text) return '';
  return text['en'] ?? text['fr'] ?? text['de'] ?? Object.values(text)[0] ?? '';
}

// Both search and detail pages embed their page props the same way — Next.js
// dehydrates the first React Query result into __NEXT_DATA__ for SSR.
function extractNextDataQuery<T>(html: string, queryIndex: number): T {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s
  );
  if (!match) {
    throw new Error('__NEXT_DATA__ not found — jobfinder.lu page structure changed');
  }
  const data = JSON.parse(match[1]);
  const query = data?.props?.pageProps?.dehydratedState?.queries?.[queryIndex];
  if (!query) {
    throw new Error(
      `__NEXT_DATA__ present but queries[${queryIndex}] missing — jobfinder.lu structure changed`
    );
  }
  return query.state.data as T;
}

async function fetchSearchPage(): Promise<JobfinderSearchOffer[]> {
  const response = await fetch(SEARCH_URL, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!response.ok) {
    throw new Error(`Jobfinder search failed: HTTP ${response.status}`);
  }
  const html = await response.text();
  const data = extractNextDataQuery<JobfinderSearchData>(html, 0);
  return data.offers ?? [];
}

async function fetchDetail(id: string): Promise<JobfinderDetailData | null> {
  const response = await fetch(`${DETAIL_URL_BASE}/${id}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!response.ok) {
    return null;
  }
  const html = await response.text();
  return extractNextDataQuery<JobfinderDetailData>(html, 0);
}

export async function fetchJobfinderJobs(runId: string): Promise<{
  fetched: number;
  upserted: number;
  newJobIds: string[];
  errors: string[];
}> {
  const db = getFirestore();
  const errors: string[] = [];

  let results: JobfinderSearchOffer[];
  try {
    results = await fetchSearchPage();
  } catch (error) {
    return { fetched: 0, upserted: 0, newJobIds: [], errors: [(error as Error).message] };
  }

  const uniqueResults = Array.from(
    new Map(results.map((r) => [r.offer.id, r])).values()
  );

  const docRefs = uniqueResults.map((r) =>
    db.collection(COLLECTIONS.Vacancies).doc(`jobfinder_${r.offer.id}`)
  );
  const existingDocs = docRefs.length > 0 ? await db.getAll(...docRefs) : [];
  const existingIds = new Set(existingDocs.filter((d) => d.exists).map((d) => d.id));

  // Same non-exclusionary title-relevance prioritization as EURES — see
  // relevanceRanking.ts. Adapt the shape to what it expects.
  const candidates = uniqueResults
    .filter((r) => !existingIds.has(`jobfinder_${r.offer.id}`))
    .map((r) => ({ ...r, title: pickLocalizedText(r.offer.title) }));
  const newResults = sortByTitleRelevance(candidates).slice(0, MAX_NEW_JOBS_PER_RUN);

  let upserted = 0;
  const newJobIds: string[] = [];

  for (let i = 0; i < newResults.length; i += DETAIL_FETCH_CONCURRENCY) {
    const chunk = newResults.slice(i, i + DETAIL_FETCH_CONCURRENCY);
    await Promise.all(
      chunk.map(async (result) => {
        const id = result.offer.id;
        try {
          const detail = await fetchDetail(id);
          if (!detail) {
            errors.push(`detail fetch returned nothing for ${id}`);
            return;
          }
          const jobId = `jobfinder_${id}`;
          const address = detail.company.contact?.address;
          const vacancy: Vacancy = {
            jobId,
            source: 'Jobfinder',
            externalId: id,
            title: pickLocalizedText(detail.offer.job.title) || result.title,
            employer: detail.company.name || 'Not disclosed',
            location: {
              country: (address?.country || 'lu').toUpperCase(),
              city: address?.city ?? null,
              // No structured telework field — refined from rawDescription
              // by extractEscoAndEmbed.ts, same as every other source here.
              allowsTelework: false,
              teleworkPercentageMax: 0,
            },
            rawDescription: pickLocalizedText(detail.offer.job.description),
            estimatedSalary: null,
            extractedSkills: [],
            extractedSkillLabels: [],
            shortageOccupationMatch: null,
            matchedPersona: null,
            matchScore: null,
            postedAt:
              detail.offer.visible_online && !Number.isNaN(Date.parse(detail.offer.visible_online))
                ? Timestamp.fromDate(new Date(detail.offer.visible_online))
                : null,
            applicationDeadline:
              detail.offer.apply_before && !Number.isNaN(Date.parse(detail.offer.apply_before))
                ? Timestamp.fromDate(new Date(detail.offer.apply_before))
                : null,
            ingestedAt: FieldValue.serverTimestamp(),
            ingestionRunId: runId,
            status: 'new',
          };
          await db.collection(COLLECTIONS.Vacancies).doc(jobId).set(vacancy);
          newJobIds.push(jobId);
          upserted++;
        } catch (error) {
          errors.push(`${id}: ${(error as Error).message}`);
        }
      })
    );
  }

  logger.info('fetchJobfinderJobs complete', {
    fetched: uniqueResults.length,
    skippedExisting: existingIds.size,
    upserted,
    newJobs: newJobIds.length,
    errorCount: errors.length,
  });

  return { fetched: uniqueResults.length, upserted, newJobIds, errors };
}
