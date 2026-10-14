import { PersonaId } from '../config/personas';

export type VacancySource =
  | 'EURES'
  | 'Moovijob'
  | 'JobsLu'
  | 'SiliconLuxembourg'
  | 'UniLu'
  | 'Jobfinder'
  | 'Hays'
  | 'Adecco'
  | 'Amazon'
  | 'Cargolux'
  | 'ArcelorMittal'
  | 'BnpParibas'
  | 'Caceis';

export type VacancyStatus =
  | 'new'
  | 'matched'
  | 'applied'
  | 'rejected'
  | 'expired'
  // Manually hidden by a user from the main dashboard lists — distinct from
  // 'rejected' (reserved for an employer/pipeline outcome, not in use yet).
  // Data is kept, not deleted; see admin/archiveVacancyCallable.ts.
  | 'archived';

export interface VacancyLocation {
  country: string;
  city: string | null;
  allowsTelework: boolean;
  teleworkPercentageMax: number;
}

// Firestore document shape for jobslu_vacancies/{jobId}. The embedding vector
// used for matching is NOT stored here — it's a large field the client never
// needs, so it lives in a sibling doc jobslu_vacancy_embeddings/{jobId},
// written/read only by the Admin SDK (see matching/extractEscoAndEmbed.ts and
// matching/scoreMatch.ts).
export interface Vacancy {
  jobId: string;
  source: VacancySource;
  externalId: string;
  title: string;
  employer: string;
  location: VacancyLocation;
  rawDescription: string;
  // Resolved ESCO skill concept URIs (labels with no confident ESCO match
  // are dropped here, so this may be shorter than extractedSkillLabels).
  extractedSkills: string[];
  // Plain-text labels Gemini extracted — kept alongside the URIs so the UI
  // has something human-readable to display without an ESCO lookup per render.
  extractedSkillLabels: string[];
  estimatedSalary: number | null;
  shortageOccupationMatch: string | null;
  // The single best-fitting persona and its score — kept as the "primary"
  // match for backward compatibility and default display/sort.
  matchedPersona: PersonaId | null;
  matchScore: number | null;
  // Per-persona scores so a role that fits BOTH people surfaces on both
  // dashboards, not just the marginally-better one's. Written by scoreMatch.ts
  // alongside matchedPersona/matchScore. Absent on pre-migration docs — read
  // via a helper that falls back to matchScore when matchedPersona matches.
  matchScores?: Partial<Record<PersonaId, number>>;
  // When scoreMatch last (re)scored this vacancy. Distinct from postedAt
  // (when the listing was published) and ingestedAt (when we first fetched
  // it) — this is what "new matches since yesterday" in the digest keys off.
  matchedAt?: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | null;
  // When the listing was originally published. EURES exposes this directly
  // (creationDate); Silicon Luxembourg shows it on each listing card. Null
  // when a source doesn't expose it.
  postedAt: FirebaseFirestore.Timestamp | null;
  // Best-effort — extracted from rawDescription by Gemini (extractEscoAndEmbed.ts)
  // when the text mentions one. Neither EURES nor Silicon Luxembourg expose a
  // structured deadline field, so this is null far more often than not.
  applicationDeadline: FirebaseFirestore.Timestamp | null;
  ingestedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  ingestionRunId: string;
  status: VacancyStatus;
}
