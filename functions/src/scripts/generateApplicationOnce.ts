/**
 * Manual admin script to run application generation for one job outside the
 * Firestore trigger — NOT a deployed Cloud Function (kept out of index.ts).
 * Useful for testing against the emulator without waiting for an organic
 * matchScore >= 0.85 match.
 *
 * Usage (against the emulator):
 *   npm run build && FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=philipamwata-personal GEMINI_API_KEY=<key> node lib/scripts/generateApplicationOnce.js <jobId>
 */
import { initializeApp } from 'firebase-admin/app';
import { generateApplicationForJob } from '../documents/generateApplication';

async function main() {
  initializeApp();
  const geminiApiKey = process.env['GEMINI_API_KEY'];
  const jobId = process.argv[2];
  if (!geminiApiKey) throw new Error('GEMINI_API_KEY must be set in the environment');
  if (!jobId) throw new Error('Usage: node generateApplicationOnce.js <jobId>');

  await generateApplicationForJob(geminiApiKey, jobId);
  console.log('Done.');
}

main().catch((error) => {
  console.error('Application generation failed:', error);
  process.exit(1);
});
