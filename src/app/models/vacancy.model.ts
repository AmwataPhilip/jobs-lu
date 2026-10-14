import { Timestamp } from '@angular/fire/firestore';
import { PersonaId } from './persona.model';

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
  // Manually hidden by a user from the main dashboard lists — data is kept,
  // not deleted. See admin/archiveVacancyCallable.ts.
  | 'archived';

export interface VacancyLocation {
  country: string;
  city: string;
  allowsTelework: boolean;
  teleworkPercentageMax: number;
}

export interface Vacancy {
  jobId: string;
  source: VacancySource;
  title: string;
  employer: string;
  location: VacancyLocation;
  rawDescription: string;
  extractedSkills: string[];
  extractedSkillLabels: string[];
  estimatedSalary: number | null;
  shortageOccupationMatch: string | null;
  // Best-fitting persona + its score (primary match, default display/sort).
  matchedPersona: PersonaId | null;
  matchScore: number | null;
  // Per-persona scores so a role relevant to both people shows on both lists.
  // Absent on pre-migration docs — use personaScore() in vacancy.util.ts,
  // which falls back to matchScore when matchedPersona equals the persona.
  matchScores?: Partial<Record<PersonaId, number>>;
  // When the match was last (re)computed — powers "sort by newest match".
  matchedAt?: Timestamp | null;
  postedAt: Timestamp | null;
  applicationDeadline: Timestamp | null;
  ingestedAt: string;
  ingestionRunId: string;
  status: VacancyStatus;
}

// Resolves a persona's effective match score for a vacancy, handling both the
// new per-persona `matchScores` map and pre-migration docs that only have the
// single primary `matchScore`/`matchedPersona` pair.
export function personaScore(vacancy: Vacancy, persona: PersonaId): number | null {
  const perPersona = vacancy.matchScores?.[persona];
  if (perPersona != null) {
    return perPersona;
  }
  return vacancy.matchedPersona === persona ? vacancy.matchScore : null;
}
