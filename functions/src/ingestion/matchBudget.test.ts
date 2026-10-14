import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeMatchBudget } from './matchBudget';

const ids = (prefix: string, n: number): string[] =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('Ingestion per-run match budget', () => {
  it('takes everything when under the cap, counting all stalled as retried', () => {
    const { jobIdsToMatch, stalledRetriedCount } = computeMatchBudget(
      ids('new', 5),
      ids('stalled', 10),
      120
    );
    assert.equal(jobIdsToMatch.length, 15);
    assert.equal(stalledRetriedCount, 10);
  });

  it('prioritizes fresh discoveries, dropping stalled retries past the cap', () => {
    const { jobIdsToMatch, stalledRetriedCount } = computeMatchBudget(
      ids('new', 100),
      ids('stalled', 50),
      120
    );
    assert.equal(jobIdsToMatch.length, 120);
    // 100 fresh + 20 of the 50 stalled fit.
    assert.equal(stalledRetriedCount, 20);
    assert.ok(jobIdsToMatch.slice(0, 100).every((id) => id.startsWith('new')));
  });

  it('reports zero stalled retries when fresh jobs alone exceed the cap', () => {
    const { jobIdsToMatch, stalledRetriedCount } = computeMatchBudget(
      ids('new', 150),
      ids('stalled', 10),
      120
    );
    assert.equal(jobIdsToMatch.length, 120);
    assert.equal(stalledRetriedCount, 0);
    assert.ok(jobIdsToMatch.every((id) => id.startsWith('new')));
  });

  it('handles an empty run', () => {
    const { jobIdsToMatch, stalledRetriedCount } = computeMatchBudget([], [], 120);
    assert.equal(jobIdsToMatch.length, 0);
    assert.equal(stalledRetriedCount, 0);
  });
});
