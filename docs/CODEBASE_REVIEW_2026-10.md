# EU WorkMe — Codebase Review (October 2026)

_Reviewed 2026-10-15 against `main` @ `711e916`. This is a fresh pass, separate
from `docs/APP_AUDIT.md` (Aug 2026), whose Tasks A/B/D/E/F have since shipped
(see git log). It flags what the code looks like **now** — correctness bugs,
scalability limits, product gaps, and UX polish — ranked roughly by impact
within each section. Line references are `file:line`._

---

## Implementation status (2026-10-15)

All findings below were worked through in one pass. Summary of what shipped:

- **1.1 Digest threshold label** — ✅ Fixed. HTML + text now interpolate a single
  `THRESHOLD_PCT` constant (`sendDigest.ts`).
- **1.2 `matchedAt` timestamp** — ✅ Added. `scoreMatch.ts` stamps `matchedAt`; the
  digest filters "new matches" on it (falling back to posted/ingested for
  pre-migration docs). Unit-tested in `sendDigest.test.ts`.
- **1.3 Gemini client cache** — ✅ Now keyed by API key (`gemini.ts`).
- **2.1 `getAllVacancies` payload** — ✅ Partially. The embedding vector (the large,
  client-never-needed field) moved to a separate `jobslu_vacancy_embeddings`
  collection the client never reads. `rawDescription` is left on the doc (job-detail
  needs it); moving it too is noted as a follow-up.
- **2.2 Per-persona scores** — ✅ Added `matchScores: {philip, chiara}`; the dashboard
  pools both queries so a role fitting both shows on both lists ("Also fits …"
  badge), and the digest emails each person their own qualifying matches. Unit-tested.
- **2.3 Gemini retry/backoff** — ✅ `withRetry` around all five Gemini calls.
- **2.4 Digest N+1** — ✅ Deadline lookups batched via `getAll`.
- **3.1 Manual deadline** — ✅ `setVacancyDeadline` callable + date picker on job-detail.
- **3.2 Compliance filter/sort** — ✅ "Hide CCSS risk" toggle + "Lowest Tax Risk" sort;
  `assessCompliance` memoized per telework %.
- **3.3 Source health** — ✅ Per-source `sourceHealth` on each run, surfaced in admin.
- **3.4 In-app notifications** — ✅ `jobslu_notifications` written by the digest, shown
  via a header bell/badge with unread count.
- **3.5 Outcome feedback loop** — ⏸️ Deferred, as the report recommends (needs data).
- **4.1 Delete auto-reset** — ✅ Armed delete auto-disarms after 4s (all three views).
- **4.2 Newest-match sort** — ✅ "Newest Match" sort on the dashboard (uses `matchedAt`).
- **4.3 Entrance animation** — ✅ Job rows now animate once, when data first arrives.
- **5.1 Stale CV TODO** — ✅ Comment corrected in `personas.ts`.
- **5.2 Tests** — ✅ Added `matchBudget.test.ts`, `salary.test.ts`, `sendDigest.test.ts`
  (50 tests pass).
- **5.3 Allowlist drift test** — ✅ Verified it already covers firestore.rules,
  storage.rules, and authentication.service.ts; no change needed.
- **6.2 `jobslu_users` validation** — ⏸️ Reverted to keep the shared rules file purely
  additive (tightening an existing rule isn't additive). Worth revisiting as its own
  rules change once it can be diffed against the live Console.
- **6.1 / 6.3 (admin bypass, GCIP)** — ℹ️ Left as-is (intentional/documented).

> ⚠️ **Deploy notes.** `firestore.rules` gained two *new* collection blocks only
> (`jobslu_vacancy_embeddings`, `jobslu_notifications`) — no existing rule was altered.
> `firestore.indexes.json` was re-synced from the live Console (`firebase
> firestore:indexes`, 2026-10-15) into a merged superset across all three apps sharing
> the project, then the new `jobslu_vacancy_embeddings` vector index was added — so a
> `firebase deploy --only firestore:indexes` is additive and won't propose deleting any
> app's index. Still diff rules against the live Console before deploying, per the file
> header — live rules could not be pulled automatically here. The embedding move is
> backward-compatible (scoreMatch falls back to any inline embedding); existing docs
> migrate off-doc as they're next re-extracted. `JOBSLU_RESEND_API_KEY` stays optional —
> the digest now falls back to in-app notifications without it.

---

## 1. Correctness bugs

### 1.1 Digest email misstates its own match threshold — HIGH
`functions/src/notifications/sendDigest.ts:136`

The HTML email heading hardcodes **"🎯 New Top-Tier Matches (≥80%)"**, but:
- the actual Firestore filter is `matchScore >= 0.7` (`sendDigest.ts:23,53`),
- the **plain-text** version of the same email says `≥70%` (`sendDigest.ts:231`),
- the app-wide `TOP_MATCH_THRESHOLD` is `70` (`dashboard.component.ts:24`).

So the HTML and text halves of one email disagree, and the HTML claims a bar the
digest doesn't enforce. It's a stale literal left over from the 80→70 threshold
change (commit `575d420`). Fix: interpolate the threshold constant into both
templates instead of hardcoding it in three places.

### 1.2 "New matches" in the digest is measured by the wrong timestamp — HIGH
`functions/src/notifications/sendDigest.ts:44-77`

`fetchRecentTopMatches` decides a match is "new since last run" using the
vacancy's `postedAt` (falling back to `ingestedAt`), compared against a 24h
window. But there is **no record of when the match itself was computed** — the
`Vacancy` model (`functions/src/models/vacancy.ts:39-68`) has `postedAt`,
`ingestedAt`, but no `matchedAt`.

Consequences:
- The EURES **backfill sweep** (`fetchEuresJobs.ts:27-39`) deliberately ingests
  jobs that were *posted* weeks/months ago. When one of those is freshly matched
  today, its `postedAt` is old → it's **excluded from the digest** even though it
  is a genuinely new match the user has never seen.
- A **re-match** (`adminRematchJob`, or a persona-targeting edit that re-scores)
  never resurfaces in the digest, because neither `postedAt` nor `ingestedAt`
  moves.
- The `matchTime === 0 → include` fallback (`sendDigest.ts:70`) quietly lets
  through any job missing both timestamps, which is the opposite failure (noise).

Fix: set a `matchedAt: FieldValue.serverTimestamp()` in `scoreMatch.ts` whenever
`matchScore`/`matchedPersona` is written, and filter the digest on that. This
also unlocks a "sort by newest match" option on the dashboard (see 4.2).

### 1.3 Gemini client is cached by first API key, ignoring later ones — LOW (latent)
`functions/src/lib/gemini.ts:9-16`

`getClient` memoizes the first `GoogleGenAI` instance and never re-reads `apiKey`
on subsequent calls. Harmless today (one key, one secret), but if a key ever
rotates mid-process or a second key is introduced, calls silently keep using the
stale client. Cheap to make the cache key-aware or just construct per call.

---

## 2. Scalability & cost

### 2.1 `getAllVacancies()` ships the entire collection — including embeddings — to the browser — HIGH
`src/app/services/vacancies.service.ts:65-68`

Three views subscribe to the **unfiltered, uncapped** collection:
`admin.component.ts:142`, `applications.component.ts:51`,
`companies.component.ts:63`. Every matched vacancy carries a **768-dim
`embedding` vector** plus the full `rawDescription`, and the whole
`jobslu_vacancies` collection is downloaded client-side on each of those pages.

`getMatchedVacancies` already learned this lesson and caps at
`MAX_RESULTS = 300` (`vacancies.service.ts:29`). But `getAllVacancies` has no cap
at all, and the EURES backfill is explicitly designed to grow the collection
toward its ~19,300-job pool over time (`fetchEuresJobs.ts:16-19`). This is the
single largest scaling liability in the app — read cost, payload size, and client
memory all grow linearly and unboundedly.

Fixes, in rough order of value:
1. Compute the admin/companies stats **server-side** (a scheduled aggregation doc,
   or a callable) instead of reconstructing them from the raw collection in the
   browser.
2. Failing that, exclude `embedding` and `rawDescription` via a projection — the
   UI never uses the vector, and the list views don't need full descriptions.
3. At minimum, apply the same bounded query pattern `getMatchedVacancies` uses.

### 2.2 One job can only ever belong to one persona — MEDIUM (product-shaping)
`functions/src/matching/scoreMatch.ts:58-89`

`scoreMatch` picks the single best-fitting persona and writes one
`matchedPersona` + one `matchScore`. A role that is a strong fit for **both**
Philip and Chiara is attributed to whichever embedding is marginally closer and
**never appears in the other person's list** — even in the dashboard's "both"
view, which is just the two single-persona lists concatenated
(`dashboard.component.ts:89-108`).

For a two-person tool this is a real gap. Consider scoring per persona and storing
`matchScores: { philip, chiara }`, so each person sees everything relevant to
them. (This is a schema change touching `scoreMatch`, the digest query, the
dashboard filters, and the vacancy model.)

### 2.3 No retry/backoff on Gemini calls — MEDIUM
`functions/src/lib/gemini.ts` (all `generateContent`/`embedContent` calls)

A transient Gemini rate-limit or 5xx during ingestion throws, the job stays at
`status: 'new'`, and only the next day's **stalled-retry sweep**
(`orchestrator.ts:127-135`) picks it up — a 24h delay for a blip. A small
bounded retry with backoff around the three Gemini entry points would recover
most transient failures within the same run and shrink the backlog the sweep has
to chew through.

### 2.4 Deadline digest does an N+1 read — LOW
`functions/src/notifications/sendDigest.ts:97-100`

One `vacancyDoc.get()` per draft application. Negligible at two users; worth a
`getAll(...)` batch if the applications collection ever grows.

---

## 3. Product gaps & features

### 3.1 Application deadlines are rarely known, so deadline reminders rarely fire — MEDIUM
`functions/src/lib/gemini.ts:23-27`, `extractEscoAndEmbed.ts:47-49`

`applicationDeadline` is a best-effort Gemini read of free-text ("apply by…") and
is `null` far more often than not (the code comments say so). The entire
"approaching deadlines" half of the digest (3.1 in the Aug audit, Task B) is
therefore mostly dormant in practice. Options: let users set a deadline manually
on the job-detail page, or infer a default review window from `ingestedAt`.

### 3.2 Compliance risk is computed but never actionable — MEDIUM
`src/app/services/compliance.service.ts`, used in
`dashboard.component.ts:41`, `job-detail.component.ts:70`

The 49.9% CCSS / 34-day cross-border tax assessment is shown per card/detail but
isn't a **filter or sort key** anywhere. For cross-border candidates this is
arguably the most decision-relevant signal in the app. Add "hide high tax-risk
roles" / "sort by compliance" to the dashboard controls. (Also: `assessCompliance`
is re-run on every render for every card; memoizing it onto the vacancy once would
be cheaper, though not urgent.)

### 3.3 Source diversity is still thin and partly silent — MEDIUM
`functions/src/ingestion/orchestrator.ts:39-53`

Real, working sources are EURES + Silicon Luxembourg plus the newer direct
company fetchers (Amazon/Cargolux/ArcelorMittal/BNP/CACEIS/Hays/Adecco/Jobfinder).
Moovijob and jobs.lu remain 403-blocked (Task C, external Apify work), uni.lu is
intentionally unwired (`orchestrator.ts:33-38`). The company fetchers are brittle
HTML scrapers — when a career-site layout changes, a fetcher can start returning
zero jobs and the run still reports `partial`/`success`. Consider a per-source
"expected a non-zero yield" health check that flags a source that silently dries
up, surfaced on the admin page.

### 3.4 No in-app notification fallback when email is unconfigured — LOW
`functions/src/notifications/sendDigest.ts:306-321`

If `JOBSLU_RESEND_API_KEY` is unset, the digest computes matches then just logs a
warning and drops them. A lightweight `jobslu_notifications` doc the dashboard
could show as a bell/badge would make the digest useful even without email set up,
and gives a fallback if Resend delivery fails.

### 3.5 Outcome → matching feedback loop (still not actionable)
Carried over from `APP_AUDIT.md`: nothing about interview/offer/rejection outcomes
in `statusHistory` feeds back into persona embeddings. Correctly deferred — needs
real outcome volume first. Revisit once there's data.

---

## 4. UI / UX

### 4.1 "Arm-to-delete" state has no timeout or escape — LOW
`dashboard.component.ts:160-175`, `job-detail.component.ts:115-122`

Delete requires two clicks (arm, then confirm) with no native dialog — good — but
once armed, `pendingDelete` stays armed indefinitely with no auto-reset and no
visible "click again to confirm / cancel" affordance beyond the button label. A
user who arms one card, gets distracted, and comes back can delete with a single
stray click. Add a short timeout reset and/or an explicit cancel.

### 4.2 Can't sort by "newest match" — LOW
`dashboard.component.ts:70-87`

Sort offers match score, posted date, and salary, but not "most recently matched"
— which is what a returning user most wants ("what's new since I last looked?").
Blocked on the missing `matchedAt` field (1.2); add both together.

### 4.3 Entrance animation may not fire when data arrives after view init — VERIFY
`dashboard.component.ts:177-185`

`gsap.from(this.board.nativeElement.children, …)` runs once in
`ngAfterViewInit`. The vacancy lists are async signals initialised to `[]`
(`dashboard.component.ts:48-49`), so on a cold load the board likely has no job
cards yet when the animation runs — the stagger animates whatever placeholder
children exist, not the cards. Worth confirming the intended reveal actually plays
on first data load; if not, trigger it from an `effect()` on first non-empty list.

---

## 5. Maintenance & correctness-adjacent

### 5.1 Stale "placeholder CV" TODO after Task A shipped — LOW
`functions/src/config/personas.ts:37-39`

The `TODO: cvBullets below are illustrative starters — replace … before relying
on auto-generated applications` comment predates Task A, which moved CV bullets to
Firestore and made them admin-editable (and PDF-importable). The hardcoded bullets
here are now only the **seed default**; the comment reads as if production still
depends on them. Update it to say so, to avoid a future reader "fixing" a
non-problem.

### 5.2 Test coverage misses the parts most likely to break — MEDIUM
There are good unit tests for `compliance`, `scoreMatch` (shortage boost),
`cursorMath`, `vectorMath`, and `allowlist`. But the **digest window logic**
(section 1.2 — the actual bug), the orchestrator's per-run caps
(`orchestrator.ts:148-153`), and salary annualization
(`functions/src/lib/salary.ts`) are untested. These are exactly the kinds of
arithmetic/date-boundary logic that regress silently.

### 5.3 Allowlist still triplicated (by design) — LOW
`functions/src/config/allowlist.ts`, `firestore.rules:97-104`,
`storage.rules`. Task E added a drift-detection test
(`functions/src/config/allowlist.test.ts`) rather than deduping, because rules
files can't import TS. Confirm that test actually reads and compares all three
sources (not just the TS file against itself) — that's the only thing standing
between a silent access-control gap and a loud test failure.

---

## 6. Security (standing posture — mostly intentional, restated for awareness)

- **Blanket admin bypass in shared rules.** `firestore.rules:22-24` grants
  Philip's UID read/write to **every document in the whole Firebase project**
  (shared with `l-tz-drill` and `witram-wed`). Documented and intentional, but it
  means a compromise of that one account is a compromise of all three apps. No
  action needed unless the trust boundary changes — just the one thing to keep in
  mind before loosening anything else.
- **`jobslu_users` writes are unvalidated.** `firestore.rules:136-139` lets an
  allowlisted user write their own profile doc with no shape/size validation.
  Negligible at two trusted users; would matter if the allowlist ever widened.
- **No server-side auth enforcement (GCIP disabled).** Access rests entirely on
  Firestore/Storage rules + a client-side allowlist check
  (`index.ts:5-11`). Appropriate given the constraint; re-export the blocking
  functions if GCIP is ever enabled, for defense in depth.

---

## Suggested priority order

1. **1.1 + 1.2** — digest threshold label and `matchedAt` field. Small, and the
   digest is currently both misleading and missing real matches.
2. **2.1** — cap/project `getAllVacancies`; it's the one thing that gets worse
   every day ingestion runs.
3. **2.2** — per-persona match scores, if roles-fit-both is a real scenario for
   Philip & Chiara.
4. **5.2** — tests around the digest window and orchestrator caps, to lock 1.2
   once fixed.
5. Everything else as capacity allows.
