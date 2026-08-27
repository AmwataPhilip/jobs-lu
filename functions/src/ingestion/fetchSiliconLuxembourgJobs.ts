import * as cheerio from 'cheerio';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { Vacancy } from '../models/vacancy';

const COLLECTIONS = { Vacancies: 'jobslu_vacancies' };
const LISTING_URL_BASE = 'https://www.siliconluxembourg.lu/jobs';
const MAX_PAGES = 2; // static + polite; ~15 jobs/page, deduped across days

function jobIdFromSlug(slug: string): string {
  return `siliconlu_${slug}`;
}

async function fetchListingPage(page: number): Promise<string[]> {
  const url = page === 1 ? `${LISTING_URL_BASE}/` : `${LISTING_URL_BASE}/page/${page}/`;
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 404) {
      return []; // ran past the last page
    }
    throw new Error(`Silicon Luxembourg listing page ${page} failed: HTTP ${response.status}`);
  }
  const html = await response.text();
  const $ = cheerio.load(html);
  const hrefs: string[] = [];
  $('article.silicon_job a[href*="/jobs/"]').each((_, el) => {
    const href = $(el).attr('href');
    // Skip the listing page itself (e.g. a "view all" link inside a card)
    // and only keep real job detail URLs, which always have a slug after /jobs/.
    if (href && /\/jobs\/[^/]+\/?$/.test(href) && !hrefs.includes(href)) {
      hrefs.push(href);
    }
  });
  return hrefs;
}

async function fetchJobDetail(
  url: string
): Promise<{ title: string; employer: string; rawDescriptionHtml: string } | null> {
  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }
  const html = await response.text();
  const $ = cheerio.load(html);
  // .cs-entry__title is reused by unrelated mega-menu/recommendation widgets
  // elsewhere on the page — the real job title is the only <h1>.
  const title = $('h1').first().text().trim();
  const employer = $('.silicon-jobs-company-desc strong').first().text().trim();
  const rawDescriptionHtml = $('.entry-content').first().html() ?? '';
  if (!title) {
    return null;
  }
  return { title, employer: employer || 'Not disclosed', rawDescriptionHtml };
}

export async function fetchSiliconLuxembourgJobs(
  runId: string
): Promise<{ fetched: number; newJobIds: string[]; errors: string[] }> {
  const db = getFirestore();
  const errors: string[] = [];
  const jobUrls: string[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const hrefs = await fetchListingPage(page);
      if (hrefs.length === 0) {
        break;
      }
      jobUrls.push(...hrefs);
    } catch (error) {
      errors.push(`page ${page}: ${(error as Error).message}`);
      break;
    }
  }

  const newJobIds: string[] = [];
  let fetched = 0;

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
        source: 'SiliconLuxembourg' as const,
        externalId: jobUrl,
        title: detail.title,
        employer: detail.employer,
        // Silicon Luxembourg doesn't publish structured location data — the
        // publication is Luxembourg-focused, so country defaults to LU.
        location: { country: 'LU', city: null },
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

  logger.info('fetchSiliconLuxembourgJobs complete', { fetched, newJobs: newJobIds.length, errorCount: errors.length });
  return { fetched, newJobIds, errors };
}
