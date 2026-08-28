import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessCompliance,
  CCSS_HIGH_THRESHOLD,
  CCSS_WARNING_THRESHOLD,
  TAX_RULE_DAY_LIMIT,
} from './compliance';

describe('assessCompliance', () => {
  it('flags nothing at 0% telework', () => {
    const result = assessCompliance(0);
    assert.equal(result.ccssRisk, 'none');
    assert.equal(result.taxRuleRisk, 'none');
    assert.equal(result.estimatedAnnualRemoteDays, 0);
    assert.equal(result.daysOverLimit, 0);
  });

  it('flags everything at 100% telework', () => {
    const result = assessCompliance(100);
    assert.equal(result.ccssRisk, 'high');
    assert.equal(result.taxRuleRisk, 'warning');
    assert.equal(result.estimatedAnnualRemoteDays, 230);
    assert.equal(result.daysOverLimit, 196); // 230 - 34
  });

  it('treats exactly 49.9% as the CCSS high-risk threshold', () => {
    const atThreshold = assessCompliance(CCSS_HIGH_THRESHOLD);
    assert.equal(atThreshold.ccssRisk, 'high');

    const justBelow = assessCompliance(49.8);
    assert.notEqual(justBelow.ccssRisk, 'high');
    assert.equal(justBelow.ccssRisk, 'warning');
  });

  it('flags a CCSS warning at exactly 35% and above but below 49.9%', () => {
    const atWarning = assessCompliance(CCSS_WARNING_THRESHOLD);
    assert.equal(atWarning.ccssRisk, 'warning');

    const justBelowWarning = assessCompliance(34.9);
    assert.equal(justBelowWarning.ccssRisk, 'none');
  });

  it('flags the 34-day tax rule only once annualized days exceed 34', () => {
    // 34 / 230 * 100 ≈ 14.78%
    const underLimit = assessCompliance(14); // round(0.14 * 230) = 32 days
    assert.ok(underLimit.estimatedAnnualRemoteDays <= TAX_RULE_DAY_LIMIT);
    assert.equal(underLimit.taxRuleRisk, 'none');
    assert.equal(underLimit.daysOverLimit, 0);

    const overLimit = assessCompliance(16); // round(0.16 * 230) = 37 days
    assert.ok(overLimit.estimatedAnnualRemoteDays > TAX_RULE_DAY_LIMIT);
    assert.equal(overLimit.taxRuleRisk, 'warning');
    assert.equal(overLimit.daysOverLimit, 3); // 37 - 34
  });

  it('computes daysOverLimit accurately at 50% telework', () => {
    const result = assessCompliance(50); // 115 days
    assert.equal(result.estimatedAnnualRemoteDays, 115);
    assert.equal(result.daysOverLimit, 81); // 115 - 34
    assert.equal(result.ccssRisk, 'high');
    assert.equal(result.taxRuleRisk, 'warning');
  });

  it('clamps out-of-range negative and >100 percentages', () => {
    const negative = assessCompliance(-25);
    assert.equal(negative.estimatedAnnualRemoteDays, 0);
    assert.equal(negative.ccssRisk, 'none');

    const overflow = assessCompliance(175);
    assert.equal(overflow.estimatedAnnualRemoteDays, 230);
    assert.equal(overflow.ccssRisk, 'high');
  });
});
