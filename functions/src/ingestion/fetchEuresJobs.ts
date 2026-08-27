import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { EURES_LOCATION_CODES } from '../config/euresLocations';
import { Vacancy } from '../models/vacancy';

const SEARCH_URL =
  'https://europa.eu/eures/api/jv-searchengine/public/jv-search/search';
const DETAIL_URL_BASE = 'https://europa.eu/eures/api/jv-searchengine/public/jv/id';

const RESULTS_PER_PAGE = 50;
const MAX_PAGES = 3; // caps a single run at 150 search results, kept modest to be a polite API consumer
const DETAIL_FETCH_CONCURRENCY = 5;

const COLLECTIONS = { Vacancies: 'jobslu_vacancies' };

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

export async function fetchEuresJobs(runId: string): Promise<{
  fetched: number;
  upserted: number;
  newJobIds: string[];
  errors: string[];
}> {
  const db = getFirestore();
  const errors: string[] = [];
  const results: EuresSearchResult[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const response = await searchPage(page);
      results.push(...response.jvs);
      if (results.length >= response.numberRecords || response.jvs.length === 0) {
        break;
      }
    } catch (error) {
      errors.push(`page ${page}: ${(error as Error).message}`);
      break;
    }
  }

  let upserted = 0;
  const newJobIds: string[] = [];

  for (let i = 0; i < results.length; i += DETAIL_FETCH_CONCURRENCY) {
    const chunk = results.slice(i, i + DETAIL_FETCH_CONCURRENCY);
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
          const docRef = db.collection(COLLECTIONS.Vacancies).doc(jobId);
          const existing = await docRef.get();

          // Refreshable source fields — safe to overwrite on every run.
          const sourceFields = {
            jobId,
            source: 'EURES' as const,
            externalId: result.id,
            title: profile.title,
            employer: profile.employer?.name || 'Not disclosed',
            location: {
              country: location?.countryCode?.toUpperCase() ?? 'LU',
              city: location?.cityName ?? null,
            },
            rawDescription: profile.description ?? '',
            estimatedSalary: estimateSalary(profile),
            ingestedAt: FieldValue.serverTimestamp(),
            ingestionRunId: runId,
          };

          if (existing.exists) {
            // Never clobber matching/pipeline state set by later stages
            // (extractEscoAndEmbed, scoreMatch) on a re-ingest.
            await docRef.set(sourceFields, { merge: true });
          } else {
            const vacancy: Vacancy = {
              ...sourceFields,
              location: {
                ...sourceFields.location,
                // EURES doesn't expose a structured telework field —
                // refined from rawDescription by extractEscoAndEmbed.ts.
                allowsTelework: false,
                teleworkPercentageMax: 0,
              },
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
          upserted++;
        } catch (error) {
          errors.push(`${result.id}: ${(error as Error).message}`);
        }
      })
    );
  }

  logger.info('fetchEuresJobs complete', {
    fetched: results.length,
    upserted,
    newJobs: newJobIds.length,
    errorCount: errors.length,
  });

  return { fetched: results.length, upserted, newJobIds, errors };
}
