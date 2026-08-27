import { PersonaId } from '../config/personas';

// Pipeline stages for a real application, not just the draft-generation
// step. 'withdrawn' is reachable from 'submitted' or 'interviewing' — the
// candidate pulling out, distinct from an employer 'rejected'.
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
  // Firestore doesn't support FieldValue.serverTimestamp() inside array
  // elements, so this is a plain Timestamp.now(), not a server sentinel —
  // accurate enough for a low-volume, single-writer status history.
  changedAt: FirebaseFirestore.Timestamp;
  note: string | null;
}

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
  // Full transition history, oldest first — see admin/updateApplicationStatusCallable.ts.
  statusHistory: ApplicationStatusEvent[];
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}
