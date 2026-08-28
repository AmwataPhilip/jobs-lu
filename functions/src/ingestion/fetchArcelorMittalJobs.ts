import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { Vacancy } from '../models/vacancy';
import { fetchOracleRequisitions, jobDetailUrl, OracleRecruitingConfig } from '../lib/oracleRecruitingCloud';

// Verified live 2026-08-28 — see docs/JOB_SOURCE_INGESTION_STRATEGY.md.
// Same Oracle Recruiting Cloud platform as fetchCargoluxJobs.ts, different
// tenant. ArcelorMittal's requisition pool is global (805 postings) — the
// keyword filter narrows the server-side result set before the
// client-side PrimaryLocationCountry check below, rather than pulling
// every country's postings just to discard almost all of them.
const CONFIG: OracleRecruitingConfig = {
  host: 'emfg.fa.em4.oraclecloud.com',
  siteNumber: 'CX_4001',
  keyword: 'Luxembourg',
  limit: 50,
};

const COLLECTIONS = { Vacancies: 'jobslu_vacancies' };

export async function fetchArcelorMittalJobs(runId: string): Promise<{
  fetched: number;
  upserted: number;
  newJobIds: string[];
  errors: string[];
}> {
  const db = getFirestore();
  const errors: string[] = [];

  let requisitions;
  try {
    requisitions = await fetchOracleRequisitions(CONFIG);
  } catch (error) {
    return { fetched: 0, upserted: 0, newJobIds: [], errors: [(error as Error).message] };
  }

  // "Luxembourg" as a keyword match isn't the same as actually being
  // located there (e.g. a role mentioning a Luxembourg client/subsidiary
  // from elsewhere) — the country field is the authoritative signal.
  const luRequisitions = requisitions.filter((r) => r.PrimaryLocationCountry === 'LU');

  const docRefs = luRequisitions.map((r) =>
    db.collection(COLLECTIONS.Vacancies).doc(`arcelormittal_${r.Id}`)
  );
  const existingDocs = docRefs.length > 0 ? await db.getAll(...docRefs) : [];
  const existingIds = new Set(existingDocs.filter((d) => d.exists).map((d) => d.id));
  const newRequisitions = luRequisitions.filter((r) => !existingIds.has(`arcelormittal_${r.Id}`));

  let upserted = 0;
  const newJobIds: string[] = [];

  for (const req of newRequisitions) {
    try {
      const jobId = `arcelormittal_${req.Id}`;
      const postedDate = req.PostedDate ? new Date(req.PostedDate) : null;
      const vacancy: Vacancy = {
        jobId,
        source: 'ArcelorMittal',
        externalId: jobDetailUrl(CONFIG, req.Id),
        title: req.Title,
        employer: 'ArcelorMittal',
        location: {
          country: 'LU',
          city: req.PrimaryLocation ?? null,
          allowsTelework: false,
          teleworkPercentageMax: 0,
        },
        rawDescription: req.ShortDescriptionStr ?? '',
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
      errors.push(`${req.Id}: ${(error as Error).message}`);
    }
  }

  logger.info('fetchArcelorMittalJobs complete', {
    fetched: luRequisitions.length,
    skippedExisting: existingIds.size,
    upserted,
    newJobs: newJobIds.length,
    errorCount: errors.length,
  });

  return { fetched: luRequisitions.length, upserted, newJobIds, errors };
}
