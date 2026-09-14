export type RefundReversalInput = {
  requestedGrossCents: number;
  originalGrossCents: number;
  cumulativeRefundedGrossCents: number;
  originalCommissionCents: number;
  originalSellerEarningsCents: number;
  priorCommissionReversalCents: number;
  priorSellerReversalCents: number;
  commissionRate: number;
};

export function calculateRefundReversal(input: RefundReversalInput) {
  const remainingGrossCents = Math.max(
    input.originalGrossCents - input.cumulativeRefundedGrossCents,
    0,
  );
  const refundedGrossCents = Math.min(
    Math.max(input.requestedGrossCents, 0),
    remainingGrossCents,
  );

  if (refundedGrossCents <= 0) {
    return null;
  }

  const commissionRefundCents = Math.min(
    Math.round(
      refundedGrossCents * (input.commissionRate / 100),
    ),
    Math.max(
      input.originalCommissionCents -
        input.priorCommissionReversalCents,
      0,
    ),
  );
  const sellerRefundResponsibilityCents = Math.min(
    Math.max(refundedGrossCents - commissionRefundCents, 0),
    Math.max(
      input.originalSellerEarningsCents -
        input.priorSellerReversalCents,
      0,
    ),
  );

  return {
    refundedGrossCents,
    commissionRefundCents,
    sellerRefundResponsibilityCents,
  };
}
