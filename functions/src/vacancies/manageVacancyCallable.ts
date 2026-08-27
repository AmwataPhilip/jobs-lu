import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { isAllowlisted } from '../config/allowlist';

const COLLECTIONS = { Vacancies: 'jobslu_vacancies', Applications: 'jobslu_applications' };

function requireJobId(data: unknown): string {
  const jobId = (data as { jobId?: unknown } | null)?.jobId;
  if (typeof jobId !== 'string' || !jobId) {
    throw new HttpsError('invalid-argument', 'Expected { jobId: string }.');
  }
  return jobId;
}

// Manually hides a vacancy from the main dashboard lists without deleting
// its data — see admin panel / dashboard job card actions.
export const archiveVacancy = onCall(async (request) => {
  if (!isAllowlisted(request.auth?.token.email)) {
    throw new HttpsError('permission-denied', 'Not authorized.');
  }
  const jobId = requireJobId(request.data);
  const db = getFirestore();
  const ref = db.collection(COLLECTIONS.Vacancies).doc(jobId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Vacancy ${jobId} not found.`);
  }
  await ref.update({ status: 'archived' });
  return { jobId, status: 'archived' };
});

// Undoes archiveVacancy. Falls back to 'new' if the vacancy was archived
// before ever being scored (matchScore null) — scoreMatch.ts always sets
// status:'matched' alongside a score, so this mirrors that invariant.
export const restoreVacancy = onCall(async (request) => {
  if (!isAllowlisted(request.auth?.token.email)) {
    throw new HttpsError('permission-denied', 'Not authorized.');
  }
  const jobId = requireJobId(request.data);
  const db = getFirestore();
  const ref = db.collection(COLLECTIONS.Vacancies).doc(jobId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Vacancy ${jobId} not found.`);
  }
  const status = snap.data()?.['matchScore'] != null ? 'matched' : 'new';
  await ref.update({ status });
  return { jobId, status };
});

// Permanently removes a vacancy (and its generated application, if any) —
// unlike archiving, this can't be undone.
export const deleteVacancy = onCall(async (request) => {
  if (!isAllowlisted(request.auth?.token.email)) {
    throw new HttpsError('permission-denied', 'Not authorized.');
  }
  const jobId = requireJobId(request.data);
  const db = getFirestore();
  const batch = db.batch();
  batch.delete(db.collection(COLLECTIONS.Vacancies).doc(jobId));
  batch.delete(db.collection(COLLECTIONS.Applications).doc(jobId));
  await batch.commit();
  return { jobId, deleted: true };
});
