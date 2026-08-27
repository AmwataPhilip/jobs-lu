import { PERSONAS } from '../config/personas';

// Verified live 2026-08-28: EURES's occupationUris and sectorCodes search
// filters both looked promising but turned out unsafe to filter WITH —
// ESCO's occupation taxonomy has real gaps for exactly the roles both
// personas target (searching "DevOps"/"cybersecurity" as ESCO occupations
// returns zero results; "cloud engineer" returns nuclear/transport/
// microsystem engineer — semantic drift on the word "engineer" alone), and
// sectorCodes' result counts were small/inconsistent enough to suggest
// unreliable data coverage rather than a working filter. Either risks
// silently dropping genuinely relevant postings, which is the one thing
// this must never do (see docs/APP_AUDIT.md).
//
// So this doesn't touch the EURES query at all — it's a purely local,
// post-fetch REORDERING of candidates by a cheap title-keyword overlap
// with both personas' domains/skills/target roles, applied before a
// source's MAX_NEW_JOBS_PER_RUN slice. Zero-hit candidates are never
// dropped, just processed after every keyword-hitting one — so a run's
// limited extraction budget is spent on higher-potential candidates first
// without ever permanently excluding anything. Over enough runs, everything
// still gets extracted and scored exactly as before.
const RELEVANCE_KEYWORDS = Array.from(
  new Set(
    Object.values(PERSONAS).flatMap((persona) => [
      ...persona.domains,
      ...persona.coreSkills,
      ...persona.targetRoles,
    ])
  )
).map((keyword) => keyword.toLowerCase());

function relevanceScore(title: string): number {
  const lower = title.toLowerCase();
  let score = 0;
  for (const keyword of RELEVANCE_KEYWORDS) {
    if (lower.includes(keyword)) {
      score++;
    }
  }
  return score;
}

// Stable sort, highest keyword overlap first. Ties (including the common
// zero/zero case) keep their original relative order.
export function sortByTitleRelevance<T extends { title: string }>(candidates: T[]): T[] {
  return candidates
    .map((candidate, index) => ({ candidate, index, score: relevanceScore(candidate.title) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.candidate);
}
