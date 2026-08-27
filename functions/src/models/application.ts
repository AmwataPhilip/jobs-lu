import { PersonaId } from '../config/personas';

export type ApplicationStatus = 'draft' | 'reviewed' | 'submitted';

// Firestore document shape for jobslu_applications/{jobId} — the doc ID is
// the jobId itself (1:1 relationship, one generated application per job).
export interface JobApplication {
  applicationId: string;
  jobId: string;
  persona: PersonaId;
  generatedCoverLetter: string;
  reorderedCvBullets: string[];
  generationRationale: string;
  status: ApplicationStatus;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}
