import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { Vacancy } from '../models/vacancy';
import { sortByTitleRelevance } from './relevanceRanking';

// amazon.jobs exposes a public, undocumented, unauthenticated JSON API for
// its own search UI — verified live 2026-08-28 (see
// docs/JOB_SOURCE_INGESTION_STRATEGY.md). No bot protection, no ATS
// middleman, and unlike every other source in this file, full job
// descriptions are already inline in the search response — no per-job
// detail fetch needed at all.
const SEARCH_URL =
  'https://www.amazon.jobs/en/search.json?normalized_country_code[]=LUX&result_limit=50&offset=0';
const USER_AGENT = 'Mozilla/5.0 (compatible; EUWorkMeBot/1.0; +https://eu-workme.web.app)';

const COLLECTIONS = { Vacancies: 'jobslu_vacancies' };

interface AmazonJob {
  id: string;
  id_icims?: string;
  title: string;
  city: string | null;
  country_code: string | null;
  job_path: string;
  posted_date: string | null;
  description: string | null;
  basic_qualifications: string | null;
  preferred_qualifications: string | null;
}

function jobIdFrom(job: AmazonJob): string {
  return `amazon_${job.id}`;
}

export async function fetchAmazonJobs(runId: string): Promise<{
  fetched: number;
  upserted: number;
  newJobIds: string[];
  errors: string[];
}> {
  const db = getFirestore();
  const errors: string[] = [];

  let jobs: AmazonJob[];
  try {
    const response = await fetch(SEARCH_URL, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) {
      throw new Error(`Amazon jobs search failed: HTTP ${response.status}`);
    }
    const data = (await response.json()) as { jobs: AmazonJob[] };
    jobs = data.jobs ?? [];
  } catch (error) {
    return { fetched: 0, upserted: 0, newJobIds: [], errors: [(error as Error).message] };
  }

  const uniqueJobs = Array.from(new Map(jobs.map((j) => [j.id, j])).values());
  const docRefs = uniqueJobs.map((j) => db.collection(COLLECTIONS.Vacancies).doc(jobIdFrom(j)));
  const existingDocs = docRefs.length > 0 ? await db.getAll(...docRefs) : [];
  const existingIds = new Set(existingDocs.filter((d) => d.exists).map((d) => d.id));

  const MAX_NEW_JOBS_PER_RUN = 40;
  const candidates = uniqueJobs
    .filter((j) => !existingIds.has(jobIdFrom(j)))
    .map((j) => ({ ...j, title: j.title }));
  const newJobs = sortByTitleRelevance(candidates).slice(0, MAX_NEW_JOBS_PER_RUN);

  let upserted = 0;
  const newJobIds: string[] = [];

  for (const job of newJobs) {
    try {
      const jobId = jobIdFrom(job);
      const description = [job.description, job.basic_qualifications, job.preferred_qualifications]
        .filter(Boolean)
        .join('\n\n');
      const postedDate = job.posted_date ? new Date(job.posted_date) : null;
      const vacancy: Vacancy = {
        jobId,
        source: 'Amazon',
        externalId: `https://www.amazon.jobs${job.job_path}`,
        title: job.title,
        employer: 'Amazon',
        location: {
          country: 'LU',
          city: job.city ?? null,
          allowsTelework: false,
          teleworkPercentageMax: 0,
        },
        rawDescription: description,
        estimatedSalary: null,
        extractedSkills: [],
        extractedSkillLabels: [],
        shortageOccupationMatch: null,
        matchedPersona: null,
        matchScore: null,
        postedAt: postedDate && !Number.isNaN(postedDate.getTime()) ? Timestamp.fromDate(postedDate) : null,
        applicationDeadline: null,
        ingestedAt: FieldValue.serverTimestamp(),
        ingestionRunId: runId,
        status: 'new',
      };
      await db.collection(COLLECTIONS.Vacancies).doc(jobId).set(vacancy);
      newJobIds.push(jobId);
      upserted++;
    } catch (error) {
      errors.push(`${job.id}: ${(error as Error).message}`);
    }
  }

  logger.info('fetchAmazonJobs complete', {
    fetched: uniqueJobs.length,
    skippedExisting: existingIds.size,
    upserted,
    newJobs: newJobIds.length,
    errorCount: errors.length,
  });

  return { fetched: uniqueJobs.length, upserted, newJobIds, errors };
}
