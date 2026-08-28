import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { Vacancy } from '../models/vacancy';
import {
  extractJobPostingJsonLd,
  parseJsonLdSalary,
  parseJsonLdDate,
} from '../lib/jobPostingJsonLd';

const SEARCH_URL = 'https://www.hays.lu/en/job-search';
const USER_AGENT =
  'Mozilla/5.0 (compatible; EUWorkMeBot/1.0; +https://eu-workme.web.app)';

const COLLECTIONS = { Vacancies: 'jobslu_vacancies' };

// hays.lu's robots.txt sets `Crawl-delay: 10` for every named bot it lists
// (Msnbot, Slurp, JobCrawlerBot, etc.) — no bot-specific exemption exists for
// an unlisted UA, so this honors the same 10s pacing rather than assume it's
// exempt. Combined with a small per-run cap, worst case here is ~10*10s =
// 100s, comfortably inside the 540s ingestion function budget even stacked
// with every other source. See docs/JOB_SOURCE_INGESTION_STRATEGY.md.
const CRAWL_DELAY_MS = 10_000;
const MAX_NEW_JOBS_PER_RUN = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJobDetailUrls(html: string): string[] {
  // Hrefs are HTML-entity-encoded (&amp;) and carry tracking query params —
  // strip the query string for a stable per-job URL/id, entity-decode &amp;.
  const matches = html.matchAll(/href="(https:\/\/www\.hays\.lu\/en\/job-detail\/[^"]+)"/g);
  const urls = new Set<string>();
  for (const match of matches) {
    const decoded = match[1].replace(/&amp;/g, '&');
    urls.add(decoded.split('?')[0]);
  }
  return Array.from(urls);
}

function jobIdFromUrl(url: string): string {
  const slug = url.replace('https://www.hays.lu/en/job-detail/', '');
  return `hays_${slug}`;
}

export async function fetchHaysJobs(runId: string): Promise<{
  fetched: number;
  upserted: number;
  newJobIds: string[];
  errors: string[];
}> {
  const db = getFirestore();
  const errors: string[] = [];

  let candidateUrls: string[];
  try {
    const response = await fetch(SEARCH_URL, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) {
      throw new Error(`Hays search failed: HTTP ${response.status}`);
    }
    candidateUrls = extractJobDetailUrls(await response.text());
  } catch (error) {
    return { fetched: 0, upserted: 0, newJobIds: [], errors: [(error as Error).message] };
  }

  const docRefs = candidateUrls.map((url) =>
    db.collection(COLLECTIONS.Vacancies).doc(jobIdFromUrl(url))
  );
  const existingDocs = docRefs.length > 0 ? await db.getAll(...docRefs) : [];
  const existingIds = new Set(existingDocs.filter((d) => d.exists).map((d) => d.id));
  const newUrls = candidateUrls
    .filter((url) => !existingIds.has(jobIdFromUrl(url)))
    .slice(0, MAX_NEW_JOBS_PER_RUN);

  let upserted = 0;
  const newJobIds: string[] = [];

  // Sequential, not concurrent — this is what actually enforces the 10s
  // pacing; parallel requests would defeat the point of a crawl-delay.
  for (const url of newUrls) {
    try {
      await sleep(CRAWL_DELAY_MS);
      const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (response.status === 404 || response.status === 410) {
        // Expected, not a bug — see the identical comment in
        // fetchAdeccoJobs.ts. A listing can expire between being linked from
        // the search page and this detail fetch.
        continue;
      }
      if (!response.ok) {
        errors.push(`${url}: HTTP ${response.status}`);
        continue;
      }
      const jsonLd = extractJobPostingJsonLd(await response.text());
      if (!jsonLd?.title) {
        errors.push(`${url}: no JobPosting JSON-LD found`);
        continue;
      }
      const jobId = jobIdFromUrl(url);
      const vacancy: Vacancy = {
        jobId,
        source: 'Hays',
        externalId: url,
        title: jsonLd.title,
        // hiringOrganization on Hays listings is always "Hays" itself, not
        // the end client — this is an accurate reflection of the data (Hays
        // is a staffing agency; the real employer is often withheld until
        // application), not a parsing gap.
        employer: jsonLd.hiringOrganization?.name?.trim() || 'Hays',
        location: {
          country: 'LU',
          city: jsonLd.jobLocation?.address?.addressLocality ?? null,
          allowsTelework: false,
          teleworkPercentageMax: 0,
        },
        rawDescription: jsonLd.description ?? '',
        estimatedSalary: parseJsonLdSalary(jsonLd.baseSalary),
        extractedSkills: [],
        extractedSkillLabels: [],
        shortageOccupationMatch: null,
        matchedPersona: null,
        matchScore: null,
        postedAt: (() => {
          const date = parseJsonLdDate(jsonLd.datePosted);
          return date ? Timestamp.fromDate(date) : null;
        })(),
        applicationDeadline: (() => {
          const date = parseJsonLdDate(jsonLd.validThrough);
          return date ? Timestamp.fromDate(date) : null;
        })(),
        ingestedAt: FieldValue.serverTimestamp(),
        ingestionRunId: runId,
        status: 'new',
      };
      await db.collection(COLLECTIONS.Vacancies).doc(jobId).set(vacancy);
      newJobIds.push(jobId);
      upserted++;
    } catch (error) {
      errors.push(`${url}: ${(error as Error).message}`);
    }
  }

  logger.info('fetchHaysJobs complete', {
    fetched: candidateUrls.length,
    skippedExisting: existingIds.size,
    upserted,
    newJobs: newJobIds.length,
    errorCount: errors.length,
  });

  return { fetched: candidateUrls.length, upserted, newJobIds, errors };
}
