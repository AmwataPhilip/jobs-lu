import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  annualizeSalary,
  parseAndAnnualizeEuresSalary,
  normalizeIntervalCode,
} from '../lib/salary';

export const RECENT_PAGES = 6;
export const BACKFILL_PAGES_PER_RUN = 3;

export function computeNextBackfillCursor(
  nextPage: number,
  totalPages: number,
  recentPages: number = RECENT_PAGES
): number {
  return nextPage > totalPages ? recentPages + 1 : nextPage;
}

describe('EURES Ingestion Cursor & Salary Annualization Math', () => {
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

  it('annualizes monthly salary correctly (e.g. €5,500/mo -> €66,000/yr)', () => {
    const result = parseAndAnnualizeEuresSalary({
      referenceSalary: 5500,
      payingIntervalCode: 'Month',
    });
    assert.equal(result, 66000);
  });

  it('annualizes hourly rates correctly (e.g. €45/hr -> €82,800/yr)', () => {
    const result = parseAndAnnualizeEuresSalary({
      minimumSalary: 40,
      maximumSalary: 50,
      payingIntervalCode: 'Hour',
    });
    assert.equal(result, 45 * 1840); // 82,800
  });

  it('leaves already annual salaries unchanged (e.g. €95,000/yr -> €95,000)', () => {
    const result = parseAndAnnualizeEuresSalary({
      referenceSalary: 95000,
      payingIntervalCode: 'Year',
    });
    assert.equal(result, 95000);
  });

  it('heuristically annualizes monthly figures when payingIntervalCode is missing', () => {
    const unannotatedMonthly = annualizeSalary(6000);
    assert.equal(unannotatedMonthly, 72000); // 6000 * 12
  });

  it('heuristically annualizes hourly rates when payingIntervalCode is missing', () => {
    const unannotatedHourly = annualizeSalary(50);
    assert.equal(unannotatedHourly, 92000); // 50 * 1840
  });

  it('computes midpoint when min and max salaries are provided', () => {
    const result = parseAndAnnualizeEuresSalary({
      referenceSalary: null,
      minimumSalary: 70000,
      maximumSalary: 90000,
      payingIntervalCode: 'Year',
    });
    assert.equal(result, 80000);
  });

  it('returns null when salary object is empty or null', () => {
    assert.equal(parseAndAnnualizeEuresSalary(null), null);
    assert.equal(parseAndAnnualizeEuresSalary(undefined), null);
    assert.equal(parseAndAnnualizeEuresSalary({}), null);
    assert.equal(annualizeSalary(null), null);
    assert.equal(annualizeSalary(0), null);
  });
});
