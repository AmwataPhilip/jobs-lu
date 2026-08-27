import { PersonaId } from '../config/personas';

export type VacancySource =
  | 'EURES'
  | 'Moovijob'
  | 'JobsLu'
  | 'EIB_Portal'
  | 'SiliconLuxembourg'
  | 'UniLu';

export type VacancyStatus =
  | 'new'
  | 'matched'
  | 'applied'
  | 'rejected'
  | 'expired';

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
  ingestedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  ingestionRunId: string;
  status: VacancyStatus;
}
