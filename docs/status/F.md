---
task: F
title: Lazy-load routes to fix the bundle-size budget warning
status: done
owner: antigravity-session-2026-08-28
updated: 2026-08-28
depends_on: []
blocks: []
---

## Log
(append-only — newest entry at the bottom. One line per status change: date, who, what.)
2026-08-28 — antigravity-session-2026-08-28: claimed, starting implementation.
2026-08-28 — antigravity-session-2026-08-28: converted all non-root routes in app.routes.ts to loadComponent lazy loading, reducing main.js to 14.18 kB with zero production budget warnings.
