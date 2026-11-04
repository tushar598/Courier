import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PolicyConfigSchema, evaluatePolicy, type PolicyConfig } from '../src/index.js';

const policy: PolicyConfig = PolicyConfigSchema.parse({
  allowedProductTypes: ['giftcard', 'esim'],
  allowedCountries: ['KN', 'IN'],
  perOrderCapCents: 2_000,
  dailyCapCents: 5_000,
  approvalThresholdCents: 500,
});

const ok = { productType: 'giftcard', country: 'KN' };

describe('evaluatePolicy', () => {
  it('auto-approves at or below the threshold', () => {
    expect(evaluatePolicy(policy, { ...ok, amountCents: 500 }, 0)).toEqual({
      decision: 'auto_approve',
    });
  });

  it('needs approval above the threshold', () => {
    expect(evaluatePolicy(policy, { ...ok, amountCents: 501 }, 0)).toEqual({
      decision: 'needs_approval',
    });
  });

  it('denies above the per-order cap', () => {
    expect(evaluatePolicy(policy, { ...ok, amountCents: 2_001 }, 0)).toEqual({
      decision: 'deny',
      reasons: ['per_order_cap_exceeded'],
    });
  });

  it('denies when the daily cap would be exceeded, counting committed spend', () => {
    expect(evaluatePolicy(policy, { ...ok, amountCents: 1_000 }, 4_001)).toEqual({
      decision: 'deny',
      reasons: ['daily_cap_exceeded'],
    });
    expect(evaluatePolicy(policy, { ...ok, amountCents: 1_000 }, 4_000).decision).not.toBe('deny');
  });

  it('denies disallowed product types and countries', () => {
    const d = evaluatePolicy(policy, { productType: 'crypto', country: 'US', amountCents: 100 }, 0);
    expect(d).toEqual({
      decision: 'deny',
      reasons: ['product_type_not_allowed', 'country_not_allowed'],
    });
  });

  it('denies non-positive, fractional and non-finite amounts', () => {
    for (const amountCents of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(evaluatePolicy(policy, { ...ok, amountCents }, 0).decision).toBe('deny');
    }
  });

  it('property: never allows an order that breaks a cap', () => {
    fc.assert(
      fc.property(fc.integer({ min: -10, max: 10_000 }), fc.nat(10_000), (amount, committed) => {
        const d = evaluatePolicy(policy, { ...ok, amountCents: amount }, committed);
        if (d.decision !== 'deny') {
          expect(amount).toBeGreaterThan(0);
          expect(amount).toBeLessThanOrEqual(policy.perOrderCapCents);
          expect(committed + amount).toBeLessThanOrEqual(policy.dailyCapCents);
        }
      }),
    );
  });

  it('rejects an invalid config', () => {
    expect(() =>
      PolicyConfigSchema.parse({ ...policy, perOrderCapCents: 9_000, dailyCapCents: 5_000 }),
    ).toThrow();
    expect(() => PolicyConfigSchema.parse({ ...policy, extra: true })).toThrow();
  });
});
