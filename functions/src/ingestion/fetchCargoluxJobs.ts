import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { Vacancy } from '../models/vacancy';
import { fetchOracleRequisitions, jobDetailUrl, OracleRecruitingConfig } from '../lib/oracleRecruitingCloud';

// Verified live 2026-08-28 — see docs/JOB_SOURCE_INGESTION_STRATEGY.md.
// Cargolux's own site (cargolux.com) has no bot protection and directs to
// this Oracle Recruiting Cloud tenant; the REST API itself is what's
// actually fetched, not cargolux.com.
const CONFIG: OracleRecruitingConfig = {
  host: 'cargolux-iajigs.fa.ocs.oraclecloud.com',
  siteNumber: 'CargoluxGroundStaff',
  limit: 50,
};

const COLLECTIONS = { Vacancies: 'jobslu_vacancies' };

export async function fetchCargoluxJobs(runId: string): Promise<{
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

  // The requisition list isn't reliably filterable to Luxembourg-only via
  // the API's finder params (Cargolux's whole ground-staff site is already
  // LU-centric, but a handful of postings reference other bases) — filter
  // client-side on the country field the API does return.
  const luRequisitions = requisitions.filter((r) => r.PrimaryLocationCountry === 'LU');

  const docRefs = luRequisitions.map((r) =>
    db.collection(COLLECTIONS.Vacancies).doc(`cargolux_${r.Id}`)
  );
  const existingDocs = docRefs.length > 0 ? await db.getAll(...docRefs) : [];
  const existingIds = new Set(existingDocs.filter((d) => d.exists).map((d) => d.id));
  const newRequisitions = luRequisitions.filter((r) => !existingIds.has(`cargolux_${r.Id}`));

  let upserted = 0;
  const newJobIds: string[] = [];

  for (const req of newRequisitions) {
    try {
      const jobId = `cargolux_${req.Id}`;
      const postedDate = req.PostedDate ? new Date(req.PostedDate) : null;
      const vacancy: Vacancy = {
        jobId,
        source: 'Cargolux',
        externalId: jobDetailUrl(CONFIG, req.Id),
        title: req.Title,
        employer: 'Cargolux',
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

  logger.info('fetchCargoluxJobs complete', {
    fetched: luRequisitions.length,
    skippedExisting: existingIds.size,
    upserted,
    newJobs: newJobIds.length,
    errorCount: errors.length,
  });

  return { fetched: luRequisitions.length, upserted, newJobIds, errors };
}
