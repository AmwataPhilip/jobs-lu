# EU WorkMe

A closed, two-user job aggregation and matching tool for Philip Amwata and Chiara Witry, focused on high-relevance roles in Luxembourg and the Greater Region.

EU WorkMe pulls job listings from EURES and Luxembourg-specific sources, extracts skills and matches them against each person's profile using Gemini, flags Luxembourg cross-border tax/social-security compliance risk, and auto-drafts tailored applications for strong matches.

## Stack

- **Frontend:** Angular 18 + Tailwind CSS + GSAP, deployed to Firebase Hosting
- **Backend:** Firebase Cloud Functions (2nd gen, TypeScript)
- **Database:** Firestore, with native vector search for persona/job matching
- **AI:** Gemini (skill extraction, embeddings, cover letter/CV generation)

The Firebase project (`philipamwata-personal`) is shared with other apps — see `firestore.rules`/`storage.rules` for how access is scoped, and `firebase.json` for the dedicated `jobslu` Functions codebase and `eu-workme` Hosting site/target used to avoid colliding with them.

## Development

Run `ng serve` for a dev server at `http://localhost:4200/`. By default (`environment.useEmulators: true`) it connects to the Firebase Emulator Suite rather than the live project — start that first:

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"  # emulators need Java 21+
firebase emulators:start --only auth,firestore,functions
```

Then seed persona/reference data into the emulator (needs `functions/.secret.local` with `GEMINI_API_KEY` set):

```bash
cd functions
source <(grep -v '^#' .secret.local | sed 's/^/export /')
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=philipamwata-personal node lib/scripts/seed.js
```

## Cloud Functions

See `functions/src/`:

- `auth/blockingFunctions.ts` — Identity Platform allowlist enforcement
- `ingestion/` — EURES + Silicon Luxembourg fetchers, Apify actor wrapper, daily orchestrator
- `matching/` — ESCO skill extraction, embeddings, persona match scoring
- `documents/` — auto-generated cover letters/CVs for high-scoring matches
- `scripts/` — manual admin scripts (seed data, one-off pipeline runs), never deployed

Build with `npm run build` inside `functions/`.

## Deploying

Nothing deploys automatically. Because this project is shared, always diff `firestore.rules`/`storage.rules` against the Firebase Console before deploying rules, and deploy Functions only under the `jobslu` codebase (`firebase deploy --only functions:jobslu`) so other apps' functions aren't touched.
