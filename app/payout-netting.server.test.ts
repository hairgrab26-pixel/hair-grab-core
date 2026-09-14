import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore Node's TypeScript stripping requires the explicit extension.
import { netSaleRemainingCents } from "./payout-netting.server.ts";

function sale(
  sellerId: string,
  orderId: string,
  lineId: string,
  earnings: number,
  paid = 0,
) {
  return {
    sellerId,
    shopifyOrderId: orderId,
    shopifyLineItemId: lineId,
    entryType: "SALE",
    sellerEarningsCents: earnings,
    payoutAmountCents: paid,
  };
}

function refund(
  sellerId: string,
  orderId: string,
  lineId: string,
  earnings: number,
) {
  return {
    sellerId,
    shopifyOrderId: orderId,
    shopifyLineItemId: lineId,
    entryType: "REFUND",
    sellerEarningsCents: -earnings,
    payoutAmountCents: 0,
  };
}

test("full refund leaves no payout available", () => {
  const entry = sale("a", "order", "line", 27900);
  assert.equal(
    netSaleRemainingCents(entry, [refund("a", "order", "line", 27900)]),
    0,
  );
});

test("partial and seller-specific refunds reduce only the matching sale", () => {
  const sellerA = sale("a", "order", "line-a", 27900);
  const sellerB = sale("b", "order", "line-b", 18600);
  const refunds = [refund("a", "order", "line-a", 9300)];

  assert.equal(netSaleRemainingCents(sellerA, refunds), 18600);
  assert.equal(netSaleRemainingCents(sellerB, refunds), 18600);
});

test("already paid amounts never become negative", () => {
  const entry = sale("a", "order", "line", 27900, 10000);
  assert.equal(
    netSaleRemainingCents(entry, [refund("a", "order", "line", 27900)]),
    0,
  );
});
