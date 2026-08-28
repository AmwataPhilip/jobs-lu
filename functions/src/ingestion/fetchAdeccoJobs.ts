import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { Vacancy } from '../models/vacancy';
import {
  extractJobPostingJsonLd,
  parseJsonLdSalary,
  parseJsonLdDate,
} from '../lib/jobPostingJsonLd';

// adecco.com's general robots.txt disallows /jobs/, /job/, /job-apply/, etc.
// for crawlers generally, but explicitly publishes a Luxembourg-specific job
// sitemap for exactly this purpose — see docs/JOB_SOURCE_INGESTION_STRATEGY.md
// for the full reasoning. Deliberately only ever fetching URLs disclosed via
// this sitemap (never crawling /jobs/ directly, never following on-site
// links) is the most defensible reading of that tension.
const SITEMAP_URL = 'https://www.adecco.com/sitemap-jobs-luxembourg-en.xml';
const USER_AGENT =
  'Mozilla/5.0 (compatible; EUWorkMeBot/1.0; +https://eu-workme.web.app)';

const COLLECTIONS = { Vacancies: 'jobslu_vacancies' };
const MAX_NEW_JOBS_PER_RUN = 20;
const DETAIL_FETCH_CONCURRENCY = 3;

function extractSitemapUrls(xml: string): string[] {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]);
}

function jobIdFromUrl(url: string): string {
  // e.g. https://www.adecco.com/en-lu/find-job/<slug>/jn-052026-1029310
  const match = url.match(/\/([^/]+)\/?$/);
  return `adecco_${match ? match[1] : encodeURIComponent(url)}`;
}

export async function fetchAdeccoJobs(runId: string): Promise<{
  fetched: number;
  upserted: number;
  newJobIds: string[];
  errors: string[];
}> {
  const db = getFirestore();
  const errors: string[] = [];

  let candidateUrls: string[];
  try {
    const response = await fetch(SITEMAP_URL, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) {
      throw new Error(`Adecco LU sitemap failed: HTTP ${response.status}`);
    }
    candidateUrls = extractSitemapUrls(await response.text());
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

  for (let i = 0; i < newUrls.length; i += DETAIL_FETCH_CONCURRENCY) {
    const chunk = newUrls.slice(i, i + DETAIL_FETCH_CONCURRENCY);
    await Promise.all(
      chunk.map(async (url) => {
        try {
          const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
          if (response.status === 404 || response.status === 410) {
            // Expected, not a bug: the sitemap can legitimately list a job
            // that's since expired/been pulled between when the sitemap was
            // generated and when this fetch ran. Skip quietly rather than
            // reporting it as an ingestion error.
            return;
          }
          if (!response.ok) {
            errors.push(`${url}: HTTP ${response.status}`);
            return;
          }
          const jsonLd = extractJobPostingJsonLd(await response.text());
          if (!jsonLd?.title) {
            errors.push(`${url}: no JobPosting JSON-LD found`);
            return;
          }
          const jobId = jobIdFromUrl(url);
          const postedDate = parseJsonLdDate(jsonLd.datePosted);
          const deadlineDate = parseJsonLdDate(jsonLd.validThrough);
          const vacancy: Vacancy = {
            jobId,
            source: 'Adecco',
            externalId: url,
            title: jsonLd.title,
            // Same as Hays: hiringOrganization is the agency itself, not the
            // end client — accurate for a staffing-agency source, not a gap.
            employer: jsonLd.hiringOrganization?.name?.trim() || 'Adecco',
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
            postedAt: postedDate ? Timestamp.fromDate(postedDate) : null,
            applicationDeadline: deadlineDate ? Timestamp.fromDate(deadlineDate) : null,
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
      })
    );
  }

  logger.info('fetchAdeccoJobs complete', {
    fetched: candidateUrls.length,
    skippedExisting: existingIds.size,
    upserted,
    newJobs: newJobIds.length,
    errorCount: errors.length,
  });

  return { fetched: candidateUrls.length, upserted, newJobIds, errors };
}
