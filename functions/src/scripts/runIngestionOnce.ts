/**
 * Manual admin script to run the ingestion pipeline once outside the daily
 * schedule — NOT a deployed Cloud Function (kept out of index.ts on purpose).
 * Useful for testing against the emulator without exposing an HTTP endpoint.
 *
 * Usage (against the emulator):
 *   npm run build && FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=philipamwata-personal GEMINI_API_KEY=<key> node lib/scripts/runIngestionOnce.js
 */
import { initializeApp } from 'firebase-admin/app';
import { runIngestion } from '../ingestion/orchestrator';

async function main() {
  initializeApp();
  const geminiApiKey = process.env['GEMINI_API_KEY'];
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY must be set in the environment');
  }
  const result = await runIngestion(geminiApiKey, process.env['APIFY_TOKEN']);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error('Ingestion run failed:', error);
  process.exit(1);
});
