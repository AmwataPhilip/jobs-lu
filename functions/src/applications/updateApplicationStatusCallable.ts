import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { isAllowlisted } from '../config/allowlist';
import { ApplicationStatus } from '../models/application';

const COLLECTIONS = { Applications: 'jobslu_applications' };

const VALID_STATUSES: ApplicationStatus[] = [
  'draft',
  'reviewed',
  'submitted',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
];

// Advances (or corrects) an application's pipeline status and appends to its
// history — the only way statusHistory grows, so it stays an authoritative,
// append-only record of every stage the application has actually been in.
export const updateApplicationStatus = onCall(async (request) => {
  if (!isAllowlisted(request.auth?.token.email)) {
    throw new HttpsError('permission-denied', 'Not authorized.');
  }

  const { jobId, status, note } = request.data as {
    jobId?: unknown;
    status?: unknown;
    note?: unknown;
  };
  if (typeof jobId !== 'string' || !jobId) {
    throw new HttpsError('invalid-argument', 'Expected jobId: string.');
  }
  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as ApplicationStatus)) {
    throw new HttpsError('invalid-argument', `status must be one of: ${VALID_STATUSES.join(', ')}.`);
  }
  const cleanNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null;

  const db = getFirestore();
  const ref = db.collection(COLLECTIONS.Applications).doc(jobId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Application for ${jobId} not found.`);
  }

  await ref.update({
    status,
    // See models/application.ts — array elements can't hold a server-timestamp
    // sentinel, so this is a plain Timestamp.now().
    statusHistory: FieldValue.arrayUnion({ status, changedAt: Timestamp.now(), note: cleanNote }),
  });

  return { jobId, status };
});
