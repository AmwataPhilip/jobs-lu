import * as cheerio from 'cheerio';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { Vacancy } from '../models/vacancy';

const COLLECTIONS = { Vacancies: 'jobslu_vacancies' };
const LISTING_URL_BASE = 'https://www.siliconluxembourg.lu/jobs';
const MAX_PAGES = 2; // static + polite; ~15 jobs/page, deduped across days
const MAX_NEW_JOBS_PER_RUN = 30; // bounds per-run detail-fetch + matching cost — see fetchEuresJobs.ts

function jobIdFromSlug(slug: string): string {
  return `siliconlu_${slug}`;
}

function parseListingDate(text: string | undefined): Timestamp | null {
  if (!text) {
    return null;
  }
  // Card text is like "Aug 25, 2026" — plain, parseable by Date directly.
  const parsed = new Date(text.trim());
  return Number.isNaN(parsed.getTime()) ? null : Timestamp.fromDate(parsed);
}

async function fetchListingPage(
  page: number
): Promise<{ href: string; postedAt: Timestamp | null }[]> {
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
  const entries: { href: string; postedAt: Timestamp | null }[] = [];
  const seen = new Set<string>();
  $('article.silicon_job').each((_, article) => {
    const href = $(article).find('a[href*="/jobs/"]').first().attr('href');
    // Skip the listing page itself (e.g. a "view all" link inside a card)
    // and only keep real job detail URLs, which always have a slug after /jobs/.
    if (!href || !/\/jobs\/[^/]+\/?$/.test(href) || seen.has(href)) {
      return;
    }
    seen.add(href);
    const postedAt = parseListingDate($(article).find('.cs-meta-date').first().text());
    entries.push({ href, postedAt });
  });
  return entries;
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
  const listingEntries: { href: string; postedAt: Timestamp | null }[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const entries = await fetchListingPage(page);
      if (entries.length === 0) {
        break;
      }
      listingEntries.push(...entries);
    } catch (error) {
      errors.push(`page ${page}: ${(error as Error).message}`);
      break;
    }
  }

  // Listing hrefs carry the slug (and therefore jobId) without a detail
  // fetch, so skip existing jobs before paying for one.
  const candidates = listingEntries.map(({ href, postedAt }) => {
    const slug = href.replace(/\/$/, '').split('/').pop() ?? href;
    return { jobUrl: href, jobId: jobIdFromSlug(slug), postedAt };
  });
  const docRefs = candidates.map((c) => db.collection(COLLECTIONS.Vacancies).doc(c.jobId));
  const existingDocs = docRefs.length > 0 ? await db.getAll(...docRefs) : [];
  const existingIds = new Set(existingDocs.filter((d) => d.exists).map((d) => d.id));
  const newCandidates = candidates
    .filter((c) => !existingIds.has(c.jobId))
    .slice(0, MAX_NEW_JOBS_PER_RUN);

  const newJobIds: string[] = [];

  for (const { jobUrl, jobId, postedAt } of newCandidates) {
    try {
      const detail = await fetchJobDetail(jobUrl);
      if (!detail) {
        continue;
      }

      const vacancy: Vacancy = {
        jobId,
        source: 'SiliconLuxembourg',
        externalId: jobUrl,
        title: detail.title,
        employer: detail.employer,
        // Silicon Luxembourg doesn't publish structured location data — the
        // publication is Luxembourg-focused, so country defaults to LU.
        location: { country: 'LU', city: null, allowsTelework: false, teleworkPercentageMax: 0 },
        rawDescription: detail.rawDescriptionHtml,
        estimatedSalary: null,
        extractedSkills: [],
        extractedSkillLabels: [],
        shortageOccupationMatch: null,
        matchedPersona: null,
        matchScore: null,
        postedAt,
        applicationDeadline: null,
        ingestedAt: FieldValue.serverTimestamp(),
        ingestionRunId: runId,
        status: 'new',
      };
      await db.collection(COLLECTIONS.Vacancies).doc(jobId).set(vacancy);
      newJobIds.push(jobId);
    } catch (error) {
      errors.push(`${jobUrl}: ${(error as Error).message}`);
    }
  }

  logger.info('fetchSiliconLuxembourgJobs complete', {
    fetched: candidates.length,
    skippedExisting: existingIds.size,
    newJobs: newJobIds.length,
    errorCount: errors.length,
  });
  return { fetched: candidates.length, newJobIds, errors };
}
