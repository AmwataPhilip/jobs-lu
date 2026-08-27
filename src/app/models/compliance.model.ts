export type CcssRisk = 'none' | 'warning' | 'high';
export type TaxRuleRisk = 'none' | 'warning';

export interface ComplianceAssessment {
  ccssRisk: CcssRisk;
  taxRuleRisk: TaxRuleRisk;
  estimatedAnnualRemoteDays: number;
  daysOverLimit: number;
}
