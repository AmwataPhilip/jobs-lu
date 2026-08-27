import { PersonaId } from '../config/personas';

export type VacancySource =
  | 'EURES'
  | 'Moovijob'
  | 'JobsLu'
  | 'SiliconLuxembourg'
  | 'UniLu';

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

// Firestore document shape for jobslu_vacancies/{jobId}. `embedding` is
// written via FieldValue.vector() and isn't representable as a plain field
// here — see matching/extractEscoAndEmbed.ts.
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
  matchedPersona: PersonaId | null;
  matchScore: number | null;
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
