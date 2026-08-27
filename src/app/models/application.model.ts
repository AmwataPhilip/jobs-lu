import { PersonaId } from './persona.model';

export type ApplicationStatus = 'draft' | 'reviewed' | 'submitted';

export interface JobApplication {
  applicationId: string;
  jobId: string;
  persona: PersonaId;
  generatedCoverLetter: string;
  // Ordered ids referencing the matched persona's cvBullets, most relevant first.
  reorderedCvBullets: string[];
  generationRationale: string;
  status: ApplicationStatus;
  createdAt: string;
}
