import { assessCompliance } from './compliance.service';

describe('assessCompliance', () => {
  it('flags nothing at 0% telework', () => {
    const result = assessCompliance(0);
    expect(result.ccssRisk).toBe('none');
    expect(result.taxRuleRisk).toBe('none');
    expect(result.estimatedAnnualRemoteDays).toBe(0);
    expect(result.daysOverLimit).toBe(0);
  });

  it('flags everything at 100% telework', () => {
    const result = assessCompliance(100);
    expect(result.ccssRisk).toBe('high');
    expect(result.taxRuleRisk).toBe('warning');
    expect(result.estimatedAnnualRemoteDays).toBe(230);
    expect(result.daysOverLimit).toBe(196);
  });

  it('treats exactly 49.9% as the CCSS high-risk threshold', () => {
    expect(assessCompliance(49.9).ccssRisk).toBe('high');
    expect(assessCompliance(49.8).ccssRisk).not.toBe('high');
  });

  it('flags a CCSS warning below the high threshold but above 35%', () => {
    expect(assessCompliance(40).ccssRisk).toBe('warning');
  });

  it('flags the 34-day tax rule only once annualized days exceed 34', () => {
    // 34/230 * 100 ≈ 14.78%, just under and over that boundary
    const underLimit = assessCompliance(14);
    const overLimit = assessCompliance(16);
    expect(underLimit.estimatedAnnualRemoteDays).toBeLessThanOrEqual(34);
    expect(underLimit.taxRuleRisk).toBe('none');
    expect(overLimit.estimatedAnnualRemoteDays).toBeGreaterThan(34);
    expect(overLimit.taxRuleRisk).toBe('warning');
  });

  it('computes daysOverLimit relative to the 34-day cap', () => {
    const result = assessCompliance(50); // 115 annualized days
    expect(result.estimatedAnnualRemoteDays).toBe(115);
    expect(result.daysOverLimit).toBe(81);
  });

  it('clamps out-of-range percentages', () => {
    expect(assessCompliance(-10).estimatedAnnualRemoteDays).toBe(0);
    expect(assessCompliance(150).estimatedAnnualRemoteDays).toBe(230);
  });
});
