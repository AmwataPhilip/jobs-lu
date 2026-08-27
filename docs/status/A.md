---
task: A
title: Replace placeholder CV content with a real editor
status: done
owner: claude-code-session-2026-08-28
updated: 2026-08-28
depends_on: []
blocks: []
---

## Log
(append-only — newest entry at the bottom. One line per status change: date, who, what.)
2026-08-28 — claude-code-session-2026-08-28: claimed, starting implementation.
2026-08-28 — claude-code-session-2026-08-28: implemented adminUpdatePersonaCvBullets callable and admin CV bullets editor UI.
2026-08-28 — claude-code-session-2026-08-28: verified in emulator (add/edit/reorder/remove/save, confirmed Firestore persistence survives reload). Builds clean (functions + Angular). Pushed as f8a8428. NOT deployed yet — that commit also bundles Task B's dailyReminderDigest, which references a new JOBSLU_RESEND_API_KEY secret that doesn't exist in Secret Manager yet; deploying functions now will fail until a human provisions it (`firebase functions:secrets:set JOBSLU_RESEND_API_KEY`).
