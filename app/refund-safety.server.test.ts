import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore Node's TypeScript stripping requires the explicit extension.
import { calculateRefundReversal } from "./refund-safety.server.ts";

const original = {
  originalGrossCents: 30000,
  originalCommissionCents: 2100,
  originalSellerEarningsCents: 27900,
  commissionRate: 7,
};

test("full refund caps gross, commission, and seller reversal", () => {
  assert.deepEqual(
    calculateRefundReversal({
      ...original,
      requestedGrossCents: 30000,
      cumulativeRefundedGrossCents: 0,
      priorCommissionReversalCents: 0,
      priorSellerReversalCents: 0,
    }),
    {
      refundedGrossCents: 30000,
      commissionRefundCents: 2100,
      sellerRefundResponsibilityCents: 27900,
    },
  );
});

test("full merchandise refund keeps a retained processing fee with the seller", () => {
  assert.deepEqual(
    calculateRefundReversal({
      originalGrossCents: 30000,
      originalCommissionCents: 2100,
      originalSellerEarningsCents: 27000,
      commissionRate: 7,
      requestedGrossCents: 30000,
      cumulativeRefundedGrossCents: 0,
      priorCommissionReversalCents: 0,
      priorSellerReversalCents: 0,
    }),
    {
      refundedGrossCents: 30000,
      commissionRefundCents: 2100,
      sellerRefundResponsibilityCents: 27000,
    },
  );
});

test("partial refunds cap the final event and never exceed original amounts", () => {
  const first = calculateRefundReversal({
    ...original,
    requestedGrossCents: 10000,
    cumulativeRefundedGrossCents: 0,
    priorCommissionReversalCents: 0,
    priorSellerReversalCents: 0,
  });
  const second = calculateRefundReversal({
    ...original,
    requestedGrossCents: 10000,
    cumulativeRefundedGrossCents: 10000,
    priorCommissionReversalCents: first?.commissionRefundCents || 0,
    priorSellerReversalCents: first?.sellerRefundResponsibilityCents || 0,
  });
  const final = calculateRefundReversal({
    ...original,
    requestedGrossCents: 15000,
    cumulativeRefundedGrossCents: 20000,
    priorCommissionReversalCents:
      (first?.commissionRefundCents || 0) +
      (second?.commissionRefundCents || 0),
    priorSellerReversalCents:
      (first?.sellerRefundResponsibilityCents || 0) +
      (second?.sellerRefundResponsibilityCents || 0),
  });

  assert.equal(final?.refundedGrossCents, 10000);
  assert.equal(
    (first?.commissionRefundCents || 0) +
      (second?.commissionRefundCents || 0) +
      (final?.commissionRefundCents || 0),
    2100,
  );
  assert.equal(
    (first?.sellerRefundResponsibilityCents || 0) +
      (second?.sellerRefundResponsibilityCents || 0) +
      (final?.sellerRefundResponsibilityCents || 0),
    27900,
  );
  assert.equal(
    calculateRefundReversal({
      ...original,
      requestedGrossCents: 1,
      cumulativeRefundedGrossCents: 30000,
      priorCommissionReversalCents: 2100,
      priorSellerReversalCents: 27900,
    }),
    null,
  );
});
