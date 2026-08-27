# EU WorkMe — Delegation-Ready Work Plan

Originally written 2026-08-28 as a straight audit; reorganized the same day into
independent work packets so multiple AI sessions (or people) can pick up different
items and work in parallel without stepping on each other's files. See
`docs/APIFY_OPTIMIZATION_PLAN.md` for a deeper dive specifically on ingestion source
coverage — treat it as the detailed spec for Task C below, not a competing plan.

**Read `README.md` first if this is your first time in this repo.** It has the stack,
dev/emulator setup, secrets, and deploy commands. Nothing below repeats that — this
doc assumes you already know how to build and run the project.

## If you were told "pick something up from the audit" (no task named)

Read every file in `docs/status/`, then:

1. Filter to tasks where `status` is `not_started`, or `blocked` where you've
   independently confirmed the blocker (named in that file's `depends_on` or its Log)
   is actually resolved.
2. From what's left, take the lowest **Priority** number in this file — that's the
   ranked-by-impact order from the original audit, not an arbitrary list order.
3. That's your task. Claim it (see **Coordination protocol** below) before reading
   further or writing any code.
4. If nothing is ready (everything `in_progress`, `done`, or genuinely `blocked`),
   say so rather than picking a lower-value task to look busy, or ask the human what
   they'd like worked on instead.

If a human *did* name a specific task (a letter, or pasted a `### Task` block
directly), that overrides this — just go claim that one.

## How to use this doc once you know your task

Each `### Task` block below is self-contained: hand the whole block to a fresh AI
session as its prompt (plus "you're working in the jobs-lu repo") and it has enough
context to start without reading this entire file or the prior conversation. Before
starting:

1. Read **`docs/status/<letter>.md`** for the task (e.g. `docs/status/A.md` for Task A)
   — that file, not this one, holds the live status/owner/dependency state. This file
   (`APP_AUDIT.md`) only holds the task spec, which rarely changes, so it's safe for
   several sessions to have open at once.
2. Confirm it's actually **ready to claim**: its status file's `status` is
   `not_started` (or `blocked` with the block since resolved) *and* every ID in
   `depends_on` points to a status file whose `status: done`. If `depends_on` includes
   an `external:...` entry, that one's resolved by a human, not another task file.
3. Check **File scope** — touch only those files/directories. If your task needs to
   touch something outside its scope, stop and flag it rather than improvising.
4. Check **Contested files** below — if your scope includes one, `git log -1 --
   <file>` and `git diff` it first. If it has uncommitted or very recent changes not
   from you, coordinate (ask the human) before editing rather than assuming your view
   is current.
5. Claim the task immediately (see **Coordination protocol** below) before writing
   any code, so a second agent scanning `docs/status/` doesn't start the same work.
   After pushing your claim, `git pull` once more and re-open your status file — if
   someone else's commit landed the same task first (a real but narrow race window),
   back off and pick your next-best ready task instead of proceeding anyway.
6. Build (`npm run build` in `functions/`, `ng build` at the repo root) before
   considering a task done. Don't deploy — that's a separate, human-approved step,
   and simultaneous deploys from parallel sessions is exactly the kind of conflict
   this doc exists to avoid.

## Contested files (check before editing)

These files have had concurrent edits from more than one session already this
project, or are natural collision points because many tasks would otherwise want to
touch them:

- **`src/app/view/admin/admin.component.ts` / `.html`** — carries a substantial
  analytics/stats dashboard added by a parallel session. Only *append* new sections;
  don't reformat or restructure existing code, and don't assume the version you see
  is final.
- **`functions/src/index.ts`** — every new callable needs an export line here. Purely
  additive edits from different tasks won't logically conflict, but two sessions
  editing it at the same time will still merge-conflict at the file level. Add your
  export, save, move on — don't linger with it open.
- **`firestore.rules` / `storage.rules`** — shared across three unrelated repos in
  the same Firebase project (see the file headers). Never deploy these without a
  human diffing against what's actually live in the Firebase Console first.
- **`functions/src/config/personas.ts`** — Task A (below) rewrites how this data is
  edited (moving CV bullets to an admin UI / Firestore). If another task also wants
  to touch persona data, sequence it after Task A rather than in parallel.

## Coordination protocol (status lives in `docs/status/`, not here)

Status/owner/dependency state is deliberately kept **out of this file** and **out of
one shared file entirely** — it's one small file per task under `docs/status/`
(`A.md`…`F.md`). Two sessions updating *different* tasks then touch different files
and can never merge-conflict with each other; two sessions updating the *same* task
would still conflict, but that shouldn't happen if everyone claims before working
(step 5 above).

**Status file format** (`docs/status/<letter>.md`):

```yaml
---
task: A
title: <matches the ### Task heading in this file>
status: not_started   # not_started | in_progress | blocked | done
owner: null            # a name/session identifier, or null
updated: 2026-08-28    # bump this on every edit
depends_on: []          # other task letters, or "external:<description>"
blocks: []              # task letters that name this one in their depends_on — informational, keep in sync manually
---

## Log
(append-only — newest entry at the bottom)
```

**To claim a task:** confirm it's ready (see step 2 above), then edit only its status
file: set `status: in_progress`, `owner: <you>`, bump `updated`, append a one-line log
entry. That's a single small file — commit and push it immediately (a tiny, fast
commit) so other sessions see the claim before you start writing code, rather than
batching it with your eventual feature commit.

**To finish:** set `status: done`, append a log line noting the commit hash, commit
and push. If you get blocked (not by another task, but by something needing a human —
a design decision, a missing credential, an ambiguous requirement): set
`status: blocked`, log *why* in one line, and stop — don't guess past a real blocker.

**To check what's workable right now:** read every file in `docs/status/`. A task is
ready if `status` is `not_started` and everything in `depends_on` is `done` (or is an
`external:` entry the human has separately confirmed is resolved).

---

### Task A: Replace placeholder CV content with a real editor

**Live status:** `docs/status/A.md`
**Priority:** 1 (highest-leverage fix in this doc)
**File scope:** new callable under `functions/src/admin/` (e.g.
`updatePersonaCvBulletsCallable.ts`), one additive export line in
`functions/src/index.ts`, additive sections in `src/app/view/admin/admin.component.ts`
/ `.html` (see contested-file note above), `functions/src/config/personas.ts` only to
the extent needed to migrate `cvBullets` from a hardcoded array into a Firestore-backed
read. Follow the existing allowlist-gated `onCall` + `isAllowlisted()` pattern used by
every other mutation callable in this repo — see
`functions/src/vacancies/manageVacancyCallable.ts` or
`functions/src/applications/updateApplicationStatusCallable.ts` as the closest
examples to copy.

**Context:** `functions/src/config/personas.ts` hardcodes 4 CV bullets per person,
checked into source code, with a comment admitting they're placeholders never
replaced with real CV content. There's no CV upload anywhere —
`storage.rules` explicitly denies client writes to the one reserved application path.
Editing CV bullets today requires a code change and redeploy. Every generated cover
letter and reordered bullet list is only as good as this placeholder data, so this is
the single highest-impact fix in the app.

**Acceptance criteria:** Philip and Chiara can each add/edit/remove/reorder their own
CV bullets from the admin panel, writes go to `jobslu_personas/{id}.cvBullets` in
Firestore (not source code), and `generateApplicationForJob` reads from there instead
of the static config. No redeploy needed to update CV content going forward.

---

### Task B: Reminder digest for new matches and approaching deadlines

**Live status:** `docs/status/B.md`
**Priority:** 2 (fully parallel-safe — new files only, one export line)
**File scope:** new `functions/src/notifications/` directory, one additive export
line in `functions/src/index.ts`.

**Context:** Match scoring, posting dates, and application deadlines all exist in
Firestore, but nothing surfaces them proactively — Philip and Chiara have to manually
open the dashboard to see anything. There's no digest for new ≥80% matches or for
`draft` applications whose `applicationDeadline` is approaching.

**Acceptance criteria:** A scheduled function (reuse the `dailyIngestion` cron
cadence/pattern in `functions/src/ingestion/scheduled.ts` as a template) that emails
a short digest — new top-tier matches since last run, plus any `draft`-status
application with `applicationDeadline` within 3 days — via a transactional email API.
Needs a new secret for the email provider's API key, added the same way
`GEMINI_API_KEY`/`APIFY_TOKEN` are in `functions/src/config/secrets.ts`.

---

### Task C: Rebuild the Moovijob ingestion source

**Live status:** `docs/status/C.md` (currently `blocked` — external Apify actor
rebuild, outside this repo)
**Priority:** 3
**File scope:** the separate Apify actor project at `apify-moovijob-scraper` (not in
this repo), plus a one-line change in `functions/src/ingestion/fetchApifySource.ts`
(`MOOVIJOB_ACTOR_ID` from `null` to the new actor ID) once the rebuilt actor is
verified working.

**Context:** Verified live 2026-08-28: Moovijob, jobs.lu, and the EIB careers page all
return HTTP 403 (Cloudflare/Akamai bot protection). ADEM's job board requires login
and isn't scrapable. Only EURES and Silicon Luxembourg currently work — real source
diversity is presently one API (EURES's pool is large; Silicon Luxembourg's is small).
See `docs/APIFY_OPTIMIZATION_PLAN.md` for the detailed technical plan (Camoufox
fingerprint-hardened crawler template).

**Acceptance criteria:** the plan in `APIFY_OPTIMIZATION_PLAN.md` executed and
verified with a real (not simulated) Apify run returning actual listings, not a 403.

---

### Task D: Test suite for compliance/matching/ingestion math

**Live status:** `docs/status/D.md`
**Priority:** 4 — not urgent today, highest-regret gap if skipped too long. Fully
parallel-safe: new test files only, zero production code changes.
**File scope:** new test files only, colocated with the code under test (e.g.
`functions/src/services/compliance.service.spec.ts` pattern, or a `functions/src/
**/*.test.ts` convention — match whatever `functions/package.json`'s existing test
tooling expects; there is currently no test runner configured, so this task also
covers picking one, e.g. `vitest` or `jest`, and wiring `npm test`).

**Context:** Nothing in `functions/` or `src/` has a test suite today. The compliance
thresholds (49.9% CCSS, 34-day cross-border tax rule in
`src/app/services/compliance.service.ts`), the EURES pagination/backfill-cursor math
(`functions/src/ingestion/fetchEuresJobs.ts`), and match-scoring
(`functions/src/matching/scoreMatch.ts`) are exactly the kind of business logic that
silently breaks on a future refactor without tests catching it.

**Acceptance criteria:** a test runner wired up (`npm test` works from `functions/`),
with coverage at minimum for: compliance threshold boundary values (49.9% exactly,
34 days exactly, 0%, 100%), the EURES backfill cursor's wrap-around logic, and
`scoreMatch`'s shortage-occupation boost math.

---

### Task E: Single source of truth for the allowlist

**Live status:** `docs/status/E.md`
**Priority:** 5 (low; isolated, low-risk). Not internally parallelizable — one
person/session only, since all three files must change together atomically.
**File scope:** `functions/src/config/allowlist.ts`, `firestore.rules`,
`storage.rules` — all three, in one change.

**Context:** All three files hardcode the same two emails independently (already
flagged as a `TODO: keep in sync` comment in the rules files). A missed sync on
adding/removing a person would be a silent security gap, not a loud error.

**Acceptance criteria:** one authoritative list (likely a small JSON/TS file that
`firestore.rules`/`storage.rules` can't directly import — so realistically this means
either a build step that generates the rules' allowlist array from the same source,
or accepting the duplication but adding a CI check that fails if the three lists
diverge). Get explicit human sign-off before deploying rules changes, per the
contested-files note above.

---

### Task F: Lazy-load routes to fix the bundle-size budget warning

**Live status:** `docs/status/F.md`
**Priority:** 6 (cosmetic; not urgent for a 2-user tool). Fully parallel-safe.
**File scope:** `src/app/app.routes.ts` only (convert `component: X` entries to
`loadComponent: () => import('./view/x/x.component').then(m => m.XComponent)` for
routes other than the default dashboard).

**Context:** Every build this session logged the same warning: ~800KB vs. Angular's
512KB default budget, because `admin`, `applications`, and `matches/other` are all
eagerly bundled into `main.js` alongside the dashboard.

**Acceptance criteria:** `ng build --configuration production` no longer warns about
the initial bundle budget, and manual click-through of every route still works
(lazy-loaded routes need a moment to fetch their chunk on first navigation — confirm
that's not jarring).

---

### Decided against (deliberate spec deviations — don't re-open without a reason)

A full pass against `docs/EU WorkMe_ Technical and Product Specification Document.md`
on 2026-08-28 found the app spec-compliant on every module except two items, which
were then explicitly resolved rather than queued as tasks:

- **EIB careers portal ingestion.** The spec (Module A) names it as a required source
  for both personas. It was never built — not even attempted, unlike Moovijob/Jobs.lu
  which were built and are blocked by bot protection. Decision: **cut**, not a gap to
  fix. `EIB_Portal` has been removed from the `VacancySource` type in both
  `functions/src/models/vacancy.ts` and `src/app/models/vacancy.model.ts`, and the EIB
  actor phase was removed from `docs/APIFY_OPTIMIZATION_PLAN.md`'s roadmap. Note: EIB
  remains listed as a *target institution* in `functions/src/config/personas.ts` for
  match-scoring purposes — that's unrelated to ingestion and was intentionally left
  alone; EIB postings can still surface via EURES if EIB ever lists there.
- **ELM (European Learning Model) XML/RDF for CV assembly.** The spec (Module C)
  specifies this standard for dynamically reordering CV content. What's actually built
  reorders a flat array of CV bullet strings by Gemini-judged relevance instead.
  Decision: **accepted as sufficient, not a gap.** ELM's value is interoperability —
  letting structured CV data move between systems that both understand the standard.
  This app has no such consumer: it only ever produces a cover letter + bullet list for
  Philip or Chiara to read and manually copy (see the "auto-application only ever
  drafts" note earlier in this doc). Nothing downstream needs ELM's structure, so
  building it would add real complexity for no practical benefit right now. Revisit
  only if the app ever needs to submit to a system that specifically requires Europass
  ELM format.

Silicon Luxembourg's mechanism (plain HTTP + Cheerio instead of the spec's suggested
Apify actor) was also reviewed and left as-is — it works, that site has no bot
protection to bypass, and Apify would add cost/complexity for zero benefit here.

### Not yet actionable

**Feedback loop from application outcomes back into matching** — persona embeddings
are static; nothing about interview/offer/rejection outcomes adjusts future matching.
This needs enough real outcome data in `statusHistory` to be worth building against,
which doesn't exist yet after one day of the tracking feature being live. Revisit in
a few months, not now.
