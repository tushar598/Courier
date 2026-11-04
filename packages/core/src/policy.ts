import { z } from 'zod';

/** All money is integer US cents. */
export const PolicyConfigSchema = z
  .object({
    allowedProductTypes: z.array(z.string().min(1)).min(1),
    /** ISO 3166-1 alpha-2, upper case. */
    allowedCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
    perOrderCapCents: z.number().int().positive(),
    dailyCapCents: z.number().int().positive(),
    /** Orders strictly above this need a human. 0 = every order needs a human. */
    approvalThresholdCents: z.number().int().nonnegative(),
  })
  .strict()
  .refine((p) => p.perOrderCapCents <= p.dailyCapCents, {
    message: 'perOrderCapCents must not exceed dailyCapCents',
  });

export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;

export interface OrderIntent {
  productType: string;
  country: string;
  amountCents: number;
}

export type DenyReason =
  | 'product_type_not_allowed'
  | 'country_not_allowed'
  | 'invalid_amount'
  | 'per_order_cap_exceeded'
  | 'daily_cap_exceeded';

export type PolicyDecision =
  | { decision: 'deny'; reasons: DenyReason[] }
  | { decision: 'needs_approval' }
  | { decision: 'auto_approve' };

/**
 * Pure and deterministic. `committedTodayCents` must include every order
 * that is pending, approved, paid or delivered today, so concurrent proposals
 * cannot jointly exceed the daily cap.
 */
export function evaluatePolicy(
  policy: PolicyConfig,
  order: OrderIntent,
  committedTodayCents: number,
): PolicyDecision {
  const reasons: DenyReason[] = [];
  if (!policy.allowedProductTypes.includes(order.productType)) {
    reasons.push('product_type_not_allowed');
  }
  if (!policy.allowedCountries.includes(order.country.toUpperCase())) {
    reasons.push('country_not_allowed');
  }
  if (!Number.isSafeInteger(order.amountCents) || order.amountCents <= 0) {
    reasons.push('invalid_amount');
  } else {
    if (order.amountCents > policy.perOrderCapCents) reasons.push('per_order_cap_exceeded');
    if (committedTodayCents + order.amountCents > policy.dailyCapCents) {
      reasons.push('daily_cap_exceeded');
    }
  }
  if (reasons.length > 0) return { decision: 'deny', reasons };
  return order.amountCents > policy.approvalThresholdCents
    ? { decision: 'needs_approval' }
    : { decision: 'auto_approve' };
}
