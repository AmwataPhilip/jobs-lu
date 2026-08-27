# EU WorkMe — Weakness & Enhancement Audit

Written 2026-08-28 after implementing the ingestion timeout fix, posting/deadline dates,
archive/delete, the other-matches page, search, and application-stage tracking. This audit
covers what's left standing between the app and its actual purpose: getting Philip and
Chiara hired. See `docs/APIFY_OPTIMIZATION_PLAN.md` for a deeper dive specifically on
ingestion source coverage.

## 1. The candidate materials are placeholder data — this is the biggest gap

`functions/src/config/personas.ts` hardcodes 4 CV bullets per person, checked into source
code. The file's own comment says it outright: *"illustrative starters — replace with
Philip's/Chiara's actual CV content before relying on auto-generated applications."* That
was never done. Every generated cover letter and every reordered CV bullet list is built
from this placeholder data.

There is also **no CV upload anywhere** — `storage.rules` reserves a path for generated
application PDFs and explicitly denies client writes to it (`allow write: if false`).
Editing target roles, institutions, salary baseline, or CV bullets requires a code change
and redeploy; only `domains` got an admin-panel editor (`adminUpdatePersonaDomains`).

**Impact:** matching quality and generated cover letters are both capped by a handful of
sentences neither person actually wrote as their real CV. This isn't a UI problem, it's
the core input being wrong.

**Proposed solution:** add a real CV editor to the admin panel — a structured bullet
list editor (add/edit/remove/reorder, same shape as `CvBullet`) writing to
`jobslu_personas/{id}.cvBullets`, so both people can maintain their own CV content without
touching code. A raw-text CV upload + Gemini-assisted bullet extraction would be a good v2,
but the structured editor alone would fix the core problem cheaply.

## 2. "Auto-application" only ever drafts — nothing is submitted

Confirmed by reading `autoGenerateApplication.ts` → `generateApplicationForJob` end to end:
crossing 0.85 match score generates a cover letter + reordered bullets and writes
`status: 'draft'`. That's it. No email, no PDF, no portal submission, nothing sent to the
employer. The candidate has to copy the draft and apply manually — which the new status
tracking (draft → submitted → interviewing → offer/rejected/withdrawn) now at least lets
them log, but the "auto" in "auto-application" is presently just "auto-draft."

**Impact:** low, if expectations are set correctly — but worth being explicit about, since
the name suggests more automation than exists. Nothing broke here; this is a scope-clarity
issue, not a bug.

**Proposed solution:** either rename the concept internally to "auto-draft" to keep
expectations accurate, or invest in real submission automation for sources with a simple
mailto/apply-URL pattern (EURES applications often just link to an external apply page —
not scrapable into a one-click submit without per-employer integration work, so this is a
genuinely hard problem, not a quick fix).

## 3. Ingestion source coverage is still thin

Verified live on 2026-08-28: Moovijob, jobs.lu, and the EIB careers page all return HTTP 403
(Cloudflare/Akamai bot protection). ADEM's own job board requires a login
(`jobboard.adem.lu`) and isn't scrapable at all. Only EURES and Silicon Luxembourg
currently work. EURES's pool for the region is genuinely large (~19,300 records across the
configured NUTS codes) and the new backfill-cursor sweep will surface most of it over time,
but Silicon Luxembourg's pool is small (~2 pages), so real source diversity is currently
one API.

**Proposed solution:** already scoped in `docs/APIFY_OPTIMIZATION_PLAN.md` — rebuilding the
Moovijob actor on a fingerprint-hardened crawler template (Camoufox) is the concrete next
step, not a new idea from this audit.

## 4. No reminders — everything requires a human to check the app

There's no notification path at all: no email/push digest for new top-tier matches, no
nudge when a `draft` application has sat untouched while its `applicationDeadline` (new
this session) is approaching, and no "it's been 3 weeks since you submitted, follow up?"
prompt. Match-scoring and matching data exist, but nothing acts on it proactively.

**Proposed solution:** a scheduled function (piggybacking on the existing `dailyIngestion`
cron cadence) that scans for (a) new matches ≥80% since the last run and (b) `draft`
applications with `applicationDeadline` within 3 days, and emails a short digest to
`philip@amwatatech.com` / `chiarawitry5@gmail.com` via a transactional email API. This is
the single highest-leverage addition now that scoring, dates, and status tracking all
exist — the data is there, nothing surfaces it.

## 5. No feedback loop from outcomes back into matching

Persona embeddings are static (regenerated only when `domains` is manually edited).
Nothing about interview/offer/rejection outcomes ever adjusts future matching — an
application that got an offer and one that got instantly rejected score identically
against future postings with similar text.

**Proposed solution:** out of scope for now (this is a real ML feedback-loop project, not
a quick win) — but worth flagging as the natural next step once enough outcome data exists
in `statusHistory` to be useful (probably after a few months of real usage).

## 6. Operational gaps

- **No automated tests.** Nothing in `functions/` or `src/` has a test suite. The
  compliance thresholds (49.9% CCSS, 34-day tax rule), the ingestion pagination/backfill
  math, and the match-scoring logic are exactly the kind of business logic that silently
  breaks on refactors without tests catching it.
- **Allowlist duplication.** `functions/src/config/allowlist.ts`, `firestore.rules`, and
  `storage.rules` each hardcode the same two emails independently (already flagged as a
  TODO in the rules files themselves) — a missed sync on adding/removing a person would be
  a silent security gap, not a loud error.
- **Bundle size.** Every build in this session logged the same warning: ~800KB vs a 512KB
  budget. Not urgent for a 2-user tool, but lazy-loading the admin/applications/other-matches
  routes (currently all eagerly bundled into `main.js`) would be a cheap fix if it starts
  mattering.
- **Single point of failure on Gemini.** Matching, extraction, and application generation
  all depend on one API key with no fallback — a Gemini outage or rate-limit stalls the
  entire pipeline (bounded now by the batching fix, so it degrades gracefully rather than
  timing out, but it still fully stalls).

## Priority ranking

1. **CV content editor** (§1) — cheapest fix, highest quality impact; everything downstream
   (matching relevance, cover letter quality) depends on this being real data.
2. **Reminder digest** (§4) — the data to power this already exists post this session's
   work; it's the biggest "surface what's already there" opportunity.
3. **Moovijob source rebuild** (§3) — already planned separately, biggest lever for match
   volume/diversity beyond EURES.
4. **Tests around compliance/matching/ingestion math** (§6) — not urgent today, but the
   highest-regret gap if skipped for too long given how easy it'd be to silently break the
   49.9%/34-day thresholds during a future refactor.
5. Everything else in §5–6 is real but lower-leverage until the above are done.
