import * as cheerio from 'cheerio';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { Vacancy } from '../models/vacancy';

const COLLECTIONS = { Vacancies: 'jobslu_vacancies' };
const LISTING_URL = 'https://www.uni.lu/en/about/work/explore-our-jobs/';

// The listing's "Load more" pagination is AJAX (an Elasticsearch-backed
// wp-json endpoint whose exact request payload we couldn't reverse-engineer
// cleanly) — this only scrapes the static initial-page HTML (~9 postings).
// Still real, fresh postings each run; deduped by jobId across days like
// every other source, so coverage still accumulates over time.
function jobIdFromSlug(slug: string): string {
  return `unilu_${slug}`;
}

async function fetchListingUrls(): Promise<string[]> {
  const response = await fetch(LISTING_URL);
  if (!response.ok) {
    throw new Error(`Uni.lu listing failed: HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);
  const hrefs: string[] = [];
  $('a[href*="/en/jobs/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && !hrefs.includes(href)) {
      hrefs.push(href);
    }
  });
  return hrefs;
}

async function fetchJobDetail(url: string): Promise<{
  title: string;
  employer: string;
  city: string | null;
  rawDescriptionHtml: string;
} | null> {
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  const html = await response.text();
  const $ = cheerio.load(html);
  const title = $('.hero__header h1').first().text().trim() || $('h1').first().text().trim();
  if (!title) {
    return null;
  }

  let organisation: string | null = null;
  let city: string | null = null;
  $('.job-overview__info__cell').each((_, cell) => {
    const label = $(cell).find('.icon-info__body > div').first().text().trim();
    const value = $(cell).find('.font-medium.text-dark').first().text().trim();
    if (/organisation/i.test(label)) {
      organisation = value;
    } else if (/location/i.test(label)) {
      city = value;
    }
  });

  const rawDescriptionHtml = $('.entry-content').first().html() ?? '';

  return {
    title,
    employer: organisation || 'University of Luxembourg',
    city,
    rawDescriptionHtml,
  };
}

export async function fetchUniLuJobs(
  runId: string
): Promise<{ fetched: number; newJobIds: string[]; errors: string[] }> {
  const db = getFirestore();
  const errors: string[] = [];
  const newJobIds: string[] = [];
  let fetched = 0;

  let jobUrls: string[] = [];
  try {
    jobUrls = await fetchListingUrls();
  } catch (error) {
    errors.push((error as Error).message);
    return { fetched: 0, newJobIds: [], errors };
  }

  for (const jobUrl of jobUrls) {
    try {
      const detail = await fetchJobDetail(jobUrl);
      if (!detail) {
        continue;
      }
      fetched++;

      const slug = jobUrl.replace(/\/$/, '').split('/').pop() ?? jobUrl;
      const jobId = jobIdFromSlug(slug);
      const docRef = db.collection(COLLECTIONS.Vacancies).doc(jobId);
      const existing = await docRef.get();

      const sourceFields = {
        jobId,
        source: 'UniLu' as const,
        externalId: jobUrl,
        title: detail.title,
        employer: detail.employer,
        location: { country: 'LU', city: detail.city },
        rawDescription: detail.rawDescriptionHtml,
        estimatedSalary: null,
        ingestedAt: FieldValue.serverTimestamp(),
        ingestionRunId: runId,
      };

      if (existing.exists) {
        await docRef.set(sourceFields, { merge: true });
      } else {
        const vacancy: Vacancy = {
          ...sourceFields,
          location: { ...sourceFields.location, allowsTelework: false, teleworkPercentageMax: 0 },
          extractedSkills: [],
          extractedSkillLabels: [],
          shortageOccupationMatch: null,
          matchedPersona: null,
          matchScore: null,
          status: 'new',
        };
        await docRef.set(vacancy);
        newJobIds.push(jobId);
      }
    } catch (error) {
      errors.push(`${jobUrl}: ${(error as Error).message}`);
    }
  }

  logger.info('fetchUniLuJobs complete', { fetched, newJobs: newJobIds.length, errorCount: errors.length });
  return { fetched, newJobIds, errors };
}
