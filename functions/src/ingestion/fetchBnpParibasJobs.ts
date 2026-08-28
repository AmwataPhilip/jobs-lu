import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { Vacancy } from '../models/vacancy';
import { parseRssItems } from '../lib/rssFeed';

// Verified live 2026-08-28 — see docs/JOB_SOURCE_INGESTION_STRATEGY.md.
// Standard WordPress "Jobs Archive" RSS feed, no bot protection. Small
// volume (~10 items, WordPress's default RSS item count) but zero risk —
// same trade-off as the other Tier 1 sources there.
const FEED_URL = 'https://www.bnpparibas.lu/en/jobs/feed/';
const USER_AGENT = 'Mozilla/5.0 (compatible; EUWorkMeBot/1.0; +https://eu-workme.web.app)';

const COLLECTIONS = { Vacancies: 'jobslu_vacancies' };

function jobIdFromLink(link: string): string {
  const slug = link.replace(/\/$/, '').split('/').pop() ?? link;
  return `bnpparibas_${slug}`;
}

// The feed's <description> is a truncated excerpt ending in "[…]" plus a
// "The post ... appeared first on ..." footer WordPress always appends —
// neither is useful raw description text, so this strips both rather than
// storing boilerplate as if it were real job content.
function cleanDescription(html: string): string {
  return html.replace(/<p>The post.*?<\/p>\s*$/s, '').trim();
}

export async function fetchBnpParibasJobs(runId: string): Promise<{
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
      throw new Error(`BNP Paribas jobs feed failed: HTTP ${response.status}`);
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
      const postedDate = item.pubDate ? new Date(item.pubDate) : null;
      const vacancy: Vacancy = {
        jobId,
        source: 'BnpParibas',
        externalId: item.link,
        title: item.title,
        employer: 'BGL BNP Paribas',
        location: {
          country: 'LU',
          city: null,
          allowsTelework: false,
          teleworkPercentageMax: 0,
        },
        rawDescription: cleanDescription(item.description),
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
      errors.push(`${item.link}: ${(error as Error).message}`);
    }
  }

  logger.info('fetchBnpParibasJobs complete', {
    fetched: items.length,
    skippedExisting: existingIds.size,
    upserted,
    newJobs: newJobIds.length,
    errorCount: errors.length,
  });

  return { fetched: items.length, upserted, newJobIds, errors };
}
