/**
 * Utility to ensure all salary metrics across the platform represent Annual Gross Salary (EUR).
 * If historical or unannotated monthly/hourly values are encountered, they are automatically annualized.
 */
export function annualizeSalary(amount: number | null | undefined): number | null {
  if (amount == null || Number.isNaN(amount) || amount <= 0) {
    return null;
  }

  // Heuristic:
  // - amount < 200: Hourly rate (e.g. €25 - €100/hr) -> 1840 hours/yr
  // - amount >= 200 && amount < 15000: Monthly salary (e.g. €2,500 - €12,000/mo) -> 12 months/yr
  // - amount >= 15000: Already an annual salary (e.g. €45,000 - €250,000/yr)
  if (amount < 200) {
    return Math.round(amount * 1840);
  }
  if (amount >= 200 && amount < 15000) {
    return Math.round(amount * 12);
  }
  return Math.round(amount);
}

export function formatAnnualSalary(amount: number | null | undefined): string {
  const annualized = annualizeSalary(amount);
  if (!annualized) return 'Not disclosed';
  return `€${annualized.toLocaleString('en-US')}/yr`;
}
