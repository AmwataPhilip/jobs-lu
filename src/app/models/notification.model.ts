import { Timestamp } from '@angular/fire/firestore';
import { PersonaId } from './persona.model';

export interface NotificationTopMatch {
  jobId: string;
  title: string;
  employer: string;
  score: number;
}

// jobslu_notifications/{id} — written server-side by the daily digest
// (functions/src/notifications/sendDigest.ts) so digest content is available
// in-app whether or not email delivery is configured/succeeds.
export interface DigestNotification {
  id: string;
  persona: PersonaId;
  type: string;
  title: string;
  summary: string;
  newMatchCount: number;
  deadlineCount: number;
  topMatches: NotificationTopMatch[];
  emailSent: boolean;
  createdAt: Timestamp | null;
  readAt: Timestamp | null;
}
