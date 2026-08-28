export type PayingInterval =
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'year';

export const WORKING_DAYS_PER_YEAR = 230;
export const WORKING_HOURS_PER_YEAR = 1840; // 40h/week * 46 weeks
export const WEEKS_PER_YEAR = 52;
export const MONTHS_PER_YEAR = 12;

export interface RawSalaryInput {
  minimumSalary?: number | null;
  maximumSalary?: number | null;
  referenceSalary?: number | null;
  payingIntervalCode?: string | null;
}

/**
 * Normalizes a paying interval code from APIs (EURES, Schema.org, etc.)
 */
export function normalizeIntervalCode(code: string | null | undefined): PayingInterval | null {
  if (!code) return null;
  const clean = code.trim().toLowerCase();
  if (['hour', 'hourly', 'h', 'hr', 'std', 'heure'].includes(clean)) return 'hour';
  if (['day', 'daily', 'd', 'tag', 'jour'].includes(clean)) return 'day';
  if (['week', 'weekly', 'w', 'wk', 'woche', 'semaine'].includes(clean)) return 'week';
  if (['month', 'monthly', 'm', 'mo', 'monat', 'mois'].includes(clean)) return 'month';
  if (['year', 'yearly', 'annual', 'annually', 'a', 'yr', 'jahr', 'an', 'annee', 'année'].includes(clean)) return 'year';
  return null;
}

/**
 * Computes an annualized gross EUR salary from raw amounts and optional interval code.
 * Defensively handles unannotated monthly/hourly amounts.
 */
export function annualizeSalary(
  amount: number | null | undefined,
  intervalCode?: string | null
): number | null {
  if (amount == null || Number.isNaN(amount) || amount <= 0) {
    return null;
  }

  const interval = normalizeIntervalCode(intervalCode);

  if (interval === 'hour') {
    return Math.round(amount * WORKING_HOURS_PER_YEAR);
  }
  if (interval === 'day') {
    return Math.round(amount * WORKING_DAYS_PER_YEAR);
  }
  if (interval === 'week') {
    return Math.round(amount * WEEKS_PER_YEAR);
  }
  if (interval === 'month') {
    return Math.round(amount * MONTHS_PER_YEAR);
  }
  if (interval === 'year') {
    return Math.round(amount);
  }

  // Heuristic fallback when interval code is missing / not specified:
  if (amount < 200) {
    // Almost certainly hourly rate (e.g. €25 - €100/hr)
    return Math.round(amount * WORKING_HOURS_PER_YEAR);
  }
  if (amount >= 200 && amount < 15000) {
    // Almost certainly monthly salary (e.g. €2,500 - €12,000/mo)
    return Math.round(amount * MONTHS_PER_YEAR);
  }
  // Already annual salary (e.g. €15,000 - €250,000/yr)
  return Math.round(amount);
}

/**
 * Extracts and annualizes salary from a EURES remuneration package.
 */
export function parseAndAnnualizeEuresSalary(salary: RawSalaryInput | null | undefined): number | null {
  if (!salary) {
    return null;
  }

  let rawAmount: number | null = null;
  if (salary.referenceSalary != null && salary.referenceSalary > 0) {
    rawAmount = salary.referenceSalary;
  } else if (
    salary.minimumSalary != null &&
    salary.maximumSalary != null &&
    salary.minimumSalary > 0 &&
    salary.maximumSalary > 0
  ) {
    rawAmount = (salary.minimumSalary + salary.maximumSalary) / 2;
  } else if (salary.minimumSalary != null && salary.minimumSalary > 0) {
    rawAmount = salary.minimumSalary;
  } else if (salary.maximumSalary != null && salary.maximumSalary > 0) {
    rawAmount = salary.maximumSalary;
  }

  return annualizeSalary(rawAmount, salary.payingIntervalCode);
}
