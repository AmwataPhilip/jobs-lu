import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

export const SHORTAGE_OCCUPATION_BOOST = 0.15;

export function calculateBoostedScore(
  baseScore: number,
  hasShortageMatch: boolean
): number {
  return hasShortageMatch
    ? Math.min(1.0, baseScore + SHORTAGE_OCCUPATION_BOOST)
    : baseScore;
}

describe('Match Score & Shortage Occupation Boost Math', () => {
  it('adds exactly +0.15 boost when shortage occupation matches', () => {
    const baseScore = 0.72;
    const boosted = calculateBoostedScore(baseScore, true);
    assert.ok(Math.abs(boosted - 0.87) < 1e-6);
  });

  it('leaves score unboosted when shortage occupation is absent', () => {
    const baseScore = 0.72;
    const unboosted = calculateBoostedScore(baseScore, false);
    assert.equal(unboosted, 0.72);
  });

  it('clamps boosted score at a maximum ceiling of 1.0', () => {
    const highBaseScore = 0.95;
    const boosted = calculateBoostedScore(highBaseScore, true);
    assert.equal(boosted, 1.0);
  });

  it('crosses top-tier threshold (0.70) with shortage boost from 0.58', () => {
    const base = 0.58; // 58% -> below 70% threshold
    const boosted = calculateBoostedScore(base, true); // 58% + 15% = 73% -> top tier!
    assert.ok(base < 0.7);
    assert.ok(boosted >= 0.7);
  });
});
