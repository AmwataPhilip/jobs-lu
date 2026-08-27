import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { EURES_LOCATION_CODES } from '../config/euresLocations';
import { Vacancy } from '../models/vacancy';

const SEARCH_URL =
  'https://europa.eu/eures/api/jv-searchengine/public/jv-search/search';
const DETAIL_URL_BASE = 'https://europa.eu/eures/api/jv-searchengine/public/jv/id';

const RESULTS_PER_PAGE = 50; // API's hard max — 60+ silently returns 0 results (verified 2026-08-27)
const DETAIL_FETCH_CONCURRENCY = 5;

// EURES's actual pool for LU + border regions is in the thousands (~3,900 for
// "lu" alone, ~19,300 across all 6 EURES_LOCATION_CODES — verified live
// 2026-08-27). A MOST_RECENT-sorted scan can only ever see a fixed top slice
// of that pool, so a plain page cap (however high) re-covers nearly the same
// jobs every run and never reaches the rest. Instead:
//  - RECENT_PAGES is rescanned from page 1 every run, so new postings surface
//    immediately.
//  - BACKFILL_PAGES_PER_RUN continues from a cursor persisted in
//    jobslu_ingestion_state/eures, advancing deeper into the pool each run
//    and wrapping back to the start once it's swept everything — so the full
//    pool eventually gets covered over many runs. Revisiting already-known
//    jobs during the sweep is cheap: see the existence pre-check below.
const RECENT_PAGES = 6;
const BACKFILL_PAGES_PER_RUN = 6;

const COLLECTIONS = { Vacancies: 'jobslu_vacancies', IngestionState: 'jobslu_ingestion_state' };
const BACKFILL_STATE_DOC = 'eures';

interface EuresSearchResult {
  id: string;
  title: string;
  employer: { name: string };
}

interface EuresSearchResponse {
  numberRecords: number;
  jvs: EuresSearchResult[];
}

interface EuresSalary {
  minimumSalary: number | null;
  maximumSalary: number | null;
  referenceSalary: number | null;
  payingIntervalCode: string | null;
}

interface EuresLocation {
  countryCode: string;
  cityName: string | null;
}

interface EuresJobProfile {
  title: string;
  description: string;
  employer: { name: string };
  locations: EuresLocation[];
  offeredRemunerationPackage: { salaries: EuresSalary[] } | null;
}

interface EuresDetailResponse {
  id: string;
  jvProfiles: Record<string, EuresJobProfile>;
}

async function searchPage(page: number): Promise<EuresSearchResponse> {
  const response = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      resultsPerPage: RESULTS_PER_PAGE,
      page,
      sortSearch: 'MOST_RECENT',
      keywords: [],
      publicationPeriod: null,
      occupationUris: [],
      skillUris: [],
      requiredExperienceCodes: [],
      positionScheduleCodes: [],
      sectorCodes: [],
      educationAndQualificationLevelCodes: [],
      positionOfferingCodes: [],
      locationCodes: EURES_LOCATION_CODES,
      euresFlagCodes: [],
      otherBenefitsCodes: [],
      requiredLanguages: [],
      minNumberPost: null,
      sessionId: `jobslu-${Date.now()}`,
      userPreferredLanguage: null,
      requestLanguage: 'en',
    }),
  });
  if (!response.ok) {
    throw new Error(
      `EURES search failed: HTTP ${response.status} on page ${page}`
    );
  }
  return (await response.json()) as EuresSearchResponse;
}

async function fetchDetail(id: string): Promise<EuresJobProfile | null> {
  const response = await fetch(
    `${DETAIL_URL_BASE}/${encodeURIComponent(id)}?requestLang=en`
  );
  if (!response.ok) {
    return null;
  }
  const detail = (await response.json()) as EuresDetailResponse;
  const profile = detail.jvProfiles['en'] ?? Object.values(detail.jvProfiles)[0];
  return profile ?? null;
}

function estimateSalary(profile: EuresJobProfile): number | null {
  const salary = profile.offeredRemunerationPackage?.salaries?.[0];
  if (!salary) {
    return null;
  }
  if (salary.referenceSalary != null) {
    return salary.referenceSalary;
  }
  if (salary.minimumSalary != null && salary.maximumSalary != null) {
    return (salary.minimumSalary + salary.maximumSalary) / 2;
  }
  return salary.minimumSalary ?? salary.maximumSalary ?? null;
}

async function getBackfillCursor(
  db: FirebaseFirestore.Firestore
): Promise<number> {
  const snap = await db.collection(COLLECTIONS.IngestionState).doc(BACKFILL_STATE_DOC).get();
  const stored = snap.data()?.['backfillPage'];
  return typeof stored === 'number' && stored > RECENT_PAGES ? stored : RECENT_PAGES + 1;
}

async function saveBackfillCursor(
  db: FirebaseFirestore.Firestore,
  nextPage: number,
  totalPages: number
): Promise<void> {
  // Wrap back to just past the recent window once a full sweep completes.
  const wrapped = nextPage > totalPages ? RECENT_PAGES + 1 : nextPage;
  await db.collection(COLLECTIONS.IngestionState).doc(BACKFILL_STATE_DOC).set(
    { backfillPage: wrapped, totalPages, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

export async function fetchEuresJobs(runId: string): Promise<{
  fetched: number;
  upserted: number;
  newJobIds: string[];
  errors: string[];
}> {
  const db = getFirestore();
  const errors: string[] = [];
  const results: EuresSearchResult[] = [];
  let numberRecords = 0;

  for (let page = 1; page <= RECENT_PAGES; page++) {
    try {
      const response = await searchPage(page);
      numberRecords = response.numberRecords;
      results.push(...response.jvs);
      if (response.jvs.length === 0) {
        break;
      }
    } catch (error) {
      errors.push(`page ${page}: ${(error as Error).message}`);
      break;
    }
  }

  const totalPages = numberRecords > 0 ? Math.ceil(numberRecords / RESULTS_PER_PAGE) : RECENT_PAGES;
  const backfillStart = await getBackfillCursor(db);
  const backfillEnd = Math.min(backfillStart + BACKFILL_PAGES_PER_RUN - 1, totalPages);
  for (let page = backfillStart; page <= backfillEnd; page++) {
    try {
      const response = await searchPage(page);
      results.push(...response.jvs);
    } catch (error) {
      errors.push(`page ${page}: ${(error as Error).message}`);
      break;
    }
  }
  await saveBackfillCursor(db, backfillEnd + 1, totalPages);

  const uniqueResults = Array.from(new Map(results.map((r) => [r.id, r])).values());

  // Search results only carry id/title/employer — cheap to check existence
  // before paying for a detail fetch + write. Without this, the backfill
  // sweep above would re-fetch full detail for jobs we already have on every
  // pass through the pool.
  const docRefs = uniqueResults.map((r) => db.collection(COLLECTIONS.Vacancies).doc(`eures_${r.id}`));
  const existingDocs = docRefs.length > 0 ? await db.getAll(...docRefs) : [];
  const existingIds = new Set(existingDocs.filter((d) => d.exists).map((d) => d.id));
  const newResults = uniqueResults.filter((r) => !existingIds.has(`eures_${r.id}`));

  let upserted = 0;
  const newJobIds: string[] = [];

  for (let i = 0; i < newResults.length; i += DETAIL_FETCH_CONCURRENCY) {
    const chunk = newResults.slice(i, i + DETAIL_FETCH_CONCURRENCY);
    await Promise.all(
      chunk.map(async (result) => {
        try {
          const profile = await fetchDetail(result.id);
          if (!profile) {
            errors.push(`detail fetch returned nothing for ${result.id}`);
            return;
          }
          const location = profile.locations?.[0];
          const jobId = `eures_${result.id}`;
          const vacancy: Vacancy = {
            jobId,
            source: 'EURES',
            externalId: result.id,
            title: profile.title,
            employer: profile.employer?.name || 'Not disclosed',
            location: {
              country: location?.countryCode?.toUpperCase() ?? 'LU',
              city: location?.cityName ?? null,
              // EURES doesn't expose a structured telework field — refined
              // from rawDescription by extractEscoAndEmbed.ts.
              allowsTelework: false,
              teleworkPercentageMax: 0,
            },
            rawDescription: profile.description ?? '',
            estimatedSalary: estimateSalary(profile),
            extractedSkills: [],
            extractedSkillLabels: [],
            shortageOccupationMatch: null,
            matchedPersona: null,
            matchScore: null,
            ingestedAt: FieldValue.serverTimestamp(),
            ingestionRunId: runId,
            status: 'new',
          };
          await db.collection(COLLECTIONS.Vacancies).doc(jobId).set(vacancy);
          newJobIds.push(jobId);
          upserted++;
        } catch (error) {
          errors.push(`${result.id}: ${(error as Error).message}`);
        }
      })
    );
  }

  logger.info('fetchEuresJobs complete', {
    fetched: uniqueResults.length,
    skippedExisting: existingIds.size,
    upserted,
    newJobs: newJobIds.length,
    backfillRange: `${backfillStart}-${backfillEnd}`,
    totalPages,
    errorCount: errors.length,
  });

  return { fetched: uniqueResults.length, upserted, newJobIds, errors };
}
