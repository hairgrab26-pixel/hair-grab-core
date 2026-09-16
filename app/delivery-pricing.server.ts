// HairGrab delivery revenue is separate from seller merchandise earnings.
export const SAME_DAY_PRICING = Object.freeze({
  currency: "USD" as const,
  markupCents: 350,
  policyVersion: "fixed-markup-v1",
});

export function priceSameDayDelivery(providerCostCents: number) {
  const shopperChargeCents = providerCostCents + SAME_DAY_PRICING.markupCents;
  if (!Number.isSafeInteger(providerCostCents) || providerCostCents < 0 ||
      !Number.isSafeInteger(shopperChargeCents)) {
    throw new Error("Invalid delivery cost.");
  }
  return {
    currency: SAME_DAY_PRICING.currency,
    providerCostCents,
    shopperChargeCents,
    expectedMarginCents: SAME_DAY_PRICING.markupCents,
    pricingPolicyVersion: SAME_DAY_PRICING.policyVersion,
  };
}
