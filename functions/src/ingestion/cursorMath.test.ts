import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

export const RECENT_PAGES = 6;
export const BACKFILL_PAGES_PER_RUN = 3;

export function computeNextBackfillCursor(
  nextPage: number,
  totalPages: number,
  recentPages: number = RECENT_PAGES
): number {
  return nextPage > totalPages ? recentPages + 1 : nextPage;
}

export function parseEuresSalary(salary: {
  minimumSalary?: number | null;
  maximumSalary?: number | null;
  referenceSalary?: number | null;
} | null | undefined): number | null {
  if (!salary) {
    return null;
  }
  if (salary.referenceSalary != null) {
    return salary.referenceSalary;
  }
  if (salary.minimumSalary != null && salary.maximumSalary != null) {
    return (salary.minimumSalary + salary.maximumSalary) / 2;
  }
  return salary.minimumSalary ?? salary.maximumSalary ?? null;
}

describe('EURES Ingestion Cursor & Salary Math', () => {
  it('advances cursor by backfill batch size during normal sweep', () => {
    const startCursor = 7; // past RECENT_PAGES (6)
    const endCursor = startCursor + BACKFILL_PAGES_PER_RUN - 1; // 9
    const totalPages = 50;

    const nextCursor = computeNextBackfillCursor(endCursor + 1, totalPages);
    assert.equal(nextCursor, 10);
  });

  it('wraps back to RECENT_PAGES + 1 once a full sweep completes', () => {
    const endCursor = 50;
    const totalPages = 50;

    const nextCursor = computeNextBackfillCursor(endCursor + 1, totalPages);
    assert.equal(nextCursor, RECENT_PAGES + 1); // Wraps back to 7
  });

  it('handles small totalPages by wrapping immediately', () => {
    const endCursor = 8;
    const totalPages = 6;

    const nextCursor = computeNextBackfillCursor(endCursor + 1, totalPages);
    assert.equal(nextCursor, 7);
  });

  it('parses reference salary when explicitly provided', () => {
    const result = parseEuresSalary({
      referenceSalary: 95000,
      minimumSalary: 80000,
      maximumSalary: 110000,
    });
    assert.equal(result, 95000);
  });

  it('computes midpoint when min and max salaries are provided', () => {
    const result = parseEuresSalary({
      referenceSalary: null,
      minimumSalary: 70000,
      maximumSalary: 90000,
    });
    assert.equal(result, 80000);
  });

  it('returns singular min or max when only one is present', () => {
    assert.equal(parseEuresSalary({ minimumSalary: 75000, maximumSalary: null }), 75000);
    assert.equal(parseEuresSalary({ minimumSalary: null, maximumSalary: 85000 }), 85000);
  });

  it('returns null when salary object is empty or null', () => {
    assert.equal(parseEuresSalary(null), null);
    assert.equal(parseEuresSalary(undefined), null);
    assert.equal(parseEuresSalary({}), null);
  });
});
