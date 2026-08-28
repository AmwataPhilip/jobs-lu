import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { Vacancy } from '../models/vacancy';
import { parseRssItems } from '../lib/rssFeed';

// Verified live 2026-08-28 — see docs/JOB_SOURCE_INGESTION_STRATEGY.md.
// CACEIS's Talentsoft-hosted career site exposes a country-filterable RSS
// feed (Rss_JobCountry=119 is Luxembourg) — no bot protection, no
// authentication. No <pubDate> in this feed (unlike BNP Paribas's), so
// postedAt stays null here — same as several other sources that don't
// expose a structured date.
const FEED_URL = 'https://jobs.caceis.com/handlers/offerRss.ashx?LCID=2057&Rss_JobCountry=119';
const USER_AGENT = 'Mozilla/5.0 (compatible; EUWorkMeBot/1.0; +https://eu-workme.web.app)';

const COLLECTIONS = { Vacancies: 'jobslu_vacancies' };

function jobIdFromLink(link: string): string {
  const match = link.match(/idOffre=(\d+)/);
  return `caceis_${match ? match[1] : encodeURIComponent(link)}`;
}

export async function fetchCaceisJobs(runId: string): Promise<{
  fetched: number;
  upserted: number;
  newJobIds: string[];
  errors: string[];
}> {
  const db = getFirestore();
  const errors: string[] = [];

  let items;
  try {
    const response = await fetch(FEED_URL, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) {
      throw new Error(`CACEIS jobs feed failed: HTTP ${response.status}`);
    }
    items = parseRssItems(await response.text());
  } catch (error) {
    return { fetched: 0, upserted: 0, newJobIds: [], errors: [(error as Error).message] };
  }

  const docRefs = items.map((item) =>
    db.collection(COLLECTIONS.Vacancies).doc(jobIdFromLink(item.link))
  );
  const existingDocs = docRefs.length > 0 ? await db.getAll(...docRefs) : [];
  const existingIds = new Set(existingDocs.filter((d) => d.exists).map((d) => d.id));
  const newItems = items.filter((item) => !existingIds.has(jobIdFromLink(item.link)));

  let upserted = 0;
  const newJobIds: string[] = [];

  for (const item of newItems) {
    try {
      const jobId = jobIdFromLink(item.link);
      const vacancy: Vacancy = {
        jobId,
        source: 'Caceis',
        externalId: item.link,
        title: item.title,
        employer: 'CACEIS',
        location: {
          country: 'LU',
          city: null,
          allowsTelework: false,
          teleworkPercentageMax: 0,
        },
        rawDescription: item.description,
        estimatedSalary: null,
        extractedSkills: [],
        extractedSkillLabels: [],
        shortageOccupationMatch: null,
        matchedPersona: null,
        matchScore: null,
        postedAt: null,
        applicationDeadline: null,
        ingestedAt: FieldValue.serverTimestamp(),
        ingestionRunId: runId,
        status: 'new',
      };
      await db.collection(COLLECTIONS.Vacancies).doc(jobId).set(vacancy);
      newJobIds.push(jobId);
      upserted++;
    } catch (error) {
      errors.push(`${item.link}: ${(error as Error).message}`);
    }
  }

  logger.info('fetchCaceisJobs complete', {
    fetched: items.length,
    skippedExisting: existingIds.size,
    upserted,
    newJobs: newJobIds.length,
    errorCount: errors.length,
  });

  return { fetched: items.length, upserted, newJobIds, errors };
}
