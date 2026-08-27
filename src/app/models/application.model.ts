import { Timestamp } from '@angular/fire/firestore';
import { PersonaId } from './persona.model';

export type ApplicationStatus =
  | 'draft'
  | 'reviewed'
  | 'submitted'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export interface ApplicationStatusEvent {
  status: ApplicationStatus;
  changedAt: Timestamp;
  note: string | null;
}

export interface JobApplication {
  applicationId: string;
  jobId: string;
  persona: PersonaId;
  generatedCoverLetter: string;
  // Ordered ids referencing the matched persona's cvBullets, most relevant first.
  reorderedCvBullets: string[];
  generationRationale: string;
  status: ApplicationStatus;
  statusHistory: ApplicationStatusEvent[];
  createdAt: string;
}
