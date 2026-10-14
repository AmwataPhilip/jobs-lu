// Pure helper for orchestrator.ts's per-run matching budget. Extracted so the
// capping/accounting math can be unit-tested without standing up Firestore.
//
// Each job matched in a run costs a real Gemini call (extractEscoAndEmbed), so
// the combined total of this run's fresh discoveries plus the stalled-retry
// sweep is bounded. Fresh discoveries are prioritized over stalled retries: a
// stalled job simply waits one more day, whereas a brand-new one would
// otherwise never be matched.
export interface MatchBudgetResult {
  jobIdsToMatch: string[];
  stalledRetriedCount: number;
}

export function computeMatchBudget(
  newJobIds: string[],
  stalledJobIds: string[],
  maxTotal: number
): MatchBudgetResult {
  const jobIdsToMatch = [...newJobIds, ...stalledJobIds].slice(0, maxTotal);
  // How many of jobIdsToMatch actually came from the stalled sweep, after the
  // shared cap — stalledJobIds.length alone would over-report if newJobIds
  // already used up (or exceeded) the total budget.
  const stalledRetriedCount =
    jobIdsToMatch.length - Math.min(newJobIds.length, jobIdsToMatch.length);
  return { jobIdsToMatch, stalledRetriedCount };
}
