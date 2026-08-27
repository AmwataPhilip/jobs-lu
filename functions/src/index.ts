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
export { autoGenerateApplication } from './documents/autoGenerateApplication';

// TEMPORARY (see admin/seedCallable.ts) — remove once production seeding is done.
export { adminSeedReferenceData } from './admin/seedCallable';
