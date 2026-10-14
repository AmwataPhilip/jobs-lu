import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  annualizeSalary,
  parseAndAnnualizeEuresSalary,
  WORKING_HOURS_PER_YEAR,
  WORKING_DAYS_PER_YEAR,
  WEEKS_PER_YEAR,
  MONTHS_PER_YEAR,
} from './salary';

describe('Salary annualization', () => {
  it('uses the explicit interval code when present', () => {
    assert.equal(annualizeSalary(25, 'hour'), 25 * WORKING_HOURS_PER_YEAR);
    assert.equal(annualizeSalary(200, 'day'), 200 * WORKING_DAYS_PER_YEAR);
    assert.equal(annualizeSalary(1500, 'week'), 1500 * WEEKS_PER_YEAR);
    assert.equal(annualizeSalary(5000, 'month'), 5000 * MONTHS_PER_YEAR);
    assert.equal(annualizeSalary(90000, 'year'), 90000);
  });

  it('normalizes multilingual / abbreviated interval codes', () => {
    assert.equal(annualizeSalary(5000, 'mois'), 5000 * MONTHS_PER_YEAR); // French month
    assert.equal(annualizeSalary(5000, 'Monat'), 5000 * MONTHS_PER_YEAR); // German month
    assert.equal(annualizeSalary(90000, 'annual'), 90000);
  });

  it('falls back to a heuristic when the interval code is missing', () => {
    assert.equal(annualizeSalary(50, null), 50 * WORKING_HOURS_PER_YEAR); // < 200 → hourly
    assert.equal(annualizeSalary(5000, null), 5000 * MONTHS_PER_YEAR); // 200–15000 → monthly
    assert.equal(annualizeSalary(90000, null), 90000); // ≥ 15000 → already annual
  });

  it('rejects non-positive / missing amounts', () => {
    assert.equal(annualizeSalary(0, 'year'), null);
    assert.equal(annualizeSalary(-5, 'year'), null);
    assert.equal(annualizeSalary(null), null);
    assert.equal(annualizeSalary(undefined), null);
    assert.equal(annualizeSalary(NaN, 'year'), null);
  });

  it('averages a EURES min/max range before annualizing', () => {
    const result = parseAndAnnualizeEuresSalary({
      minimumSalary: 4000,
      maximumSalary: 6000,
      referenceSalary: null,
      payingIntervalCode: 'month',
    });
    assert.equal(result, 5000 * MONTHS_PER_YEAR);
  });

  it('prefers referenceSalary over the min/max range', () => {
    const result = parseAndAnnualizeEuresSalary({
      minimumSalary: 4000,
      maximumSalary: 6000,
      referenceSalary: 72000,
      payingIntervalCode: 'year',
    });
    assert.equal(result, 72000);
  });

  it('returns null for a EURES package with no usable amount', () => {
    assert.equal(parseAndAnnualizeEuresSalary(null), null);
    assert.equal(
      parseAndAnnualizeEuresSalary({
        minimumSalary: null,
        maximumSalary: null,
        referenceSalary: null,
        payingIntervalCode: 'month',
      }),
      null
    );
  });
});
