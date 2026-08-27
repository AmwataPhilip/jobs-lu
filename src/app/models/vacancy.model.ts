import { PersonaId } from './persona.model';

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
  matchedPersona: PersonaId | null;
  matchScore: number | null;
  ingestedAt: string;
  ingestionRunId: string;
  status: VacancyStatus;
}
