import { initializeApp } from 'firebase-admin/app';

initializeApp();

// beforeCreate/beforeSignIn (auth/blockingFunctions.ts) are NOT exported —
// Identity Platform blocking functions require GCIP, which isn't enabled on
// this shared project (confirmed via a failed deploy 2026-08-27). The
// allowlist is enforced by firestore.rules/storage.rules instead (see
// isAllowlisted() there) plus a client-side check in
// src/app/services/authentication.service.ts for a clean sign-in UX. If GCIP
// is ever enabled project-wide, re-export these for defense in depth.
export { dailyIngestion } from './ingestion/scheduled';
export { dailyReminderDigest } from './notifications/scheduled';
export { autoGenerateApplication } from './documents/autoGenerateApplication';
export { generateTailoredCv } from './documents/generateTailoredCvCallable';

// Admin panel callables (src/app/view/admin/) — all allowlist-gated.
export { adminSeedReferenceData } from './admin/seedCallable';
export { adminRunIngestion } from './admin/runIngestionCallable';
export { adminUpdatePersonaDomains } from './admin/updatePersonaCallable';
export { adminUpdatePersonaCvBullets } from './admin/updatePersonaCvBulletsCallable';
export { adminParseCvPdf } from './admin/parseCvPdfCallable';
export { adminRematchAll, adminRematchJob } from './admin/rematchCallable';

// Vacancy management callables (dashboard/job-detail job card actions) —
// allowlist-gated.
export { archiveVacancy, restoreVacancy, deleteVacancy } from './vacancies/manageVacancyCallable';

// Application pipeline tracking (job-detail / applications page) — allowlist-gated.
export { updateApplicationStatus } from './applications/updateApplicationStatusCallable';
