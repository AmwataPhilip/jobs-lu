import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity } from './vectorMath';

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical non-zero vectors', () => {
    const a = [1, 2, 3, 4];
    const sim = cosineSimilarity(a, a);
    assert.ok(Math.abs(sim - 1.0) < 1e-6);
  });

  it('returns 1.0 for scaled identical vectors', () => {
    const a = [1, 2, 3];
    const b = [2, 4, 6];
    const sim = cosineSimilarity(a, b);
    assert.ok(Math.abs(sim - 1.0) < 1e-6);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const sim = cosineSimilarity(a, b);
    assert.ok(Math.abs(sim - 0.0) < 1e-6);
  });

  it('returns 0.0 when one or both vectors are zero vectors', () => {
    const zero = [0, 0, 0];
    const nonzero = [1, 2, 3];
    assert.equal(cosineSimilarity(zero, nonzero), 0);
    assert.equal(cosineSimilarity(nonzero, zero), 0);
    assert.equal(cosineSimilarity(zero, zero), 0);
  });

  it('throws an error when vector dimensions mismatch', () => {
    const a = [1, 2, 3];
    const b = [1, 2, 3, 4];
    assert.throws(
      () => cosineSimilarity(a, b),
      /Cannot compare vectors of different dimensions/
    );
  });
});
