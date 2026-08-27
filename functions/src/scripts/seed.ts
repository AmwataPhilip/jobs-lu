/**
 * One-time/periodic admin seed script — NOT a deployed Cloud Function (kept
 * out of index.ts on purpose, so it can never be invoked over HTTP).
 *
 * Upserts the version-controlled persona profiles (config/personas.ts) and
 * the manually-curated ADEM shortage occupation list (config/shortageOccupations.ts)
 * into Firestore. If GEMINI_API_KEY is set in the environment, also computes
 * and stores each persona's embedding (required for matching/scoreMatch.ts).
 *
 * Usage (against the emulator — safe, default):
 *   npm run build && FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=philipamwata-personal GEMINI_API_KEY=<key> node lib/scripts/seed.js
 *
 * Usage (against the LIVE project — only after the deploy safety gate has
 * been cleared with the user, never as part of routine dev work):
 *   npm run build && GOOGLE_APPLICATION_CREDENTIALS=<path> GEMINI_API_KEY=<key> node lib/scripts/seed.js
 */
import { initializeApp } from 'firebase-admin/app';
import { seedReferenceData } from '../admin/seedReferenceData';

async function main() {
  initializeApp();
  const geminiApiKey = process.env['GEMINI_API_KEY'];
  const result = await seedReferenceData(geminiApiKey);

  if (!result.embeddingsWritten) {
    console.warn(
      'GEMINI_API_KEY not set — personas seeded WITHOUT embeddings. matching/scoreMatch.ts will fail until re-seeded with the key set.'
    );
  }
  console.log(
    `Seeded ${result.personaCount} personas and ${result.shortageOccupationCount} shortage occupations.`
  );
}

main().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
