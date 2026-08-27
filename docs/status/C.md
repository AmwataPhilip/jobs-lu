---
task: C
title: Rebuild the Moovijob ingestion source
status: blocked
owner: null
updated: 2026-08-28
depends_on: [external:apify-actor-rebuild]
blocks: []
---

## Log
(append-only — newest entry at the bottom. One line per status change: date, who, what.)
2026-08-28 — initial: blocked on rebuilding the Apify actor on a fingerprint-hardened
crawler template (Camoufox) outside this repo. See docs/APIFY_OPTIMIZATION_PLAN.md.
Flip status to not_started once that external work is verified working, since the
in-repo change (one line in fetchApifySource.ts) is trivial once unblocked.
