import { Injectable } from '@angular/core';
import {
  CcssRisk,
  ComplianceAssessment,
  TaxRuleRisk,
} from '../models/compliance.model';

// Approximate Luxembourg working days/year, used to annualize a weekly
// telework percentage for the 34-day cross-border tax rule.
const WORKING_DAYS_PER_YEAR = 230;
const CCSS_HIGH_THRESHOLD = 49.9;
const CCSS_WARNING_THRESHOLD = 35;
const TAX_RULE_DAY_LIMIT = 34;

export function assessCompliance(
  teleworkPercentageMax: number
): ComplianceAssessment {
  const pct = Math.max(0, Math.min(100, teleworkPercentageMax));
  const estimatedAnnualRemoteDays = Math.round((pct / 100) * WORKING_DAYS_PER_YEAR);
  const daysOverLimit = Math.max(0, estimatedAnnualRemoteDays - TAX_RULE_DAY_LIMIT);

  let ccssRisk: CcssRisk = 'none';
  if (pct >= CCSS_HIGH_THRESHOLD) {
    ccssRisk = 'high';
  } else if (pct >= CCSS_WARNING_THRESHOLD) {
    ccssRisk = 'warning';
  }

  const taxRuleRisk: TaxRuleRisk =
    estimatedAnnualRemoteDays > TAX_RULE_DAY_LIMIT ? 'warning' : 'none';

  return { ccssRisk, taxRuleRisk, estimatedAnnualRemoteDays, daysOverLimit };
}

@Injectable({
  providedIn: 'root',
})
export class ComplianceService {
  assess(teleworkPercentageMax: number): ComplianceAssessment {
    return assessCompliance(teleworkPercentageMax);
  }
}
