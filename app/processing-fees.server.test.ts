import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore Node's TypeScript stripping requires the explicit extension.
import {
  allocateProcessingFeeCents,
  calculateFeeAdjustedSellerEarningsCents,
  extractCaptureProcessingFee,
} from "./processing-fees.server.ts";

const capture = (id: string, amount: string, type = "processing_fee") => ({
  id,
  kind: "CAPTURE",
  status: "SUCCESS",
  fees: [
    {
      type,
      amount: { amount, currencyCode: "USD" },
      taxAmount: { amount: "0.00", currencyCode: "USD" },
    },
  ],
});

test("extracts only successful capture processing fees", () => {
  const result = extractCaptureProcessingFee([
    { id: "auth", kind: "AUTHORIZATION", status: "SUCCESS", fees: [] },
    capture("capture", "3.17"),
    { id: "failed", kind: "CAPTURE", status: "FAILURE", fees: [capture("x", "8.00").fees[0]] },
    { id: "voided", kind: "CAPTURE", status: "VOIDED", fees: [capture("y", "8.00").fees[0]] },
  ], "USD");

  assert.deepEqual(result, {
    finalized: true,
    totalFeeCents: 317,
    captureCount: 1,
    feeCurrency: "USD",
  });
});

test("sums multiple captures and deduplicates transaction IDs", () => {
  const result = extractCaptureProcessingFee([
    capture("a", "1.50"),
    capture("b", "1.67"),
    capture("a", "1.50"),
  ], "USD");

  assert.equal(result.finalized, true);
  if (result.finalized) {
    assert.equal(result.totalFeeCents, 317);
    assert.equal(result.captureCount, 2);
  }
});

test("confirmed zero capture fee finalizes as zero", () => {
  const result = extractCaptureProcessingFee([
    { id: "capture", kind: "CAPTURE", status: "SUCCESS", fees: [] },
  ], "USD");

  assert.deepEqual(result, {
    finalized: true,
    totalFeeCents: 0,
    captureCount: 1,
    feeCurrency: null,
  });
});

test("missing fee data remains unfinalized", () => {
  const result = extractCaptureProcessingFee([
    { id: "capture", kind: "CAPTURE", status: "SUCCESS" },
  ], "USD");

  assert.equal(result.finalized, false);
});

test("unrecognized fee types remain unfinalized instead of being charged", () => {
  const result = extractCaptureProcessingFee([
    capture("capture", "3.17", "mystery_fee"),
  ], "USD");

  assert.equal(result.finalized, false);
});

test("currency mismatches remain unfinalized", () => {
  const result = extractCaptureProcessingFee([
    {
      ...capture("capture", "3.17"),
      fees: [{
        type: "processing_fee",
        amount: { amount: "3.17", currencyCode: "CAD" },
      }],
    },
  ], "USD");

  assert.equal(result.finalized, false);
});

test("fee-adjusted earnings preserve the existing commission amount", () => {
  assert.equal(calculateFeeAdjustedSellerEarningsCents(10000, 700, 317), 8983);
  assert.equal(calculateFeeAdjustedSellerEarningsCents(10000, 500, 317), 9183);
  assert.equal(calculateFeeAdjustedSellerEarningsCents(10000, 700, 10001), null);
});

test("allocates a single seller fee exactly", () => {
  const result = allocateProcessingFeeCents(317, [
    { id: "sale", grossAmountCents: 10000 },
  ]);

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.allocations.get("sale"), 317);
});

test("allocates proportionally with deterministic largest remainder", () => {
  const result = allocateProcessingFeeCents(400, [
    { id: "a", grossAmountCents: 7500 },
    { id: "b", grossAmountCents: 2500 },
  ]);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.allocations.get("a"), 300);
    assert.equal(result.allocations.get("b"), 100);
  }

  const rounded = allocateProcessingFeeCents(1, [
    { id: "a", grossAmountCents: 1 },
    { id: "b", grossAmountCents: 1 },
    { id: "c", grossAmountCents: 1 },
  ]);
  assert.equal(rounded.ok, true);
  if (rounded.ok) {
    assert.deepEqual([...rounded.allocations.entries()], [["a", 1], ["b", 0], ["c", 0]]);
  }
});

test("allocates across multiple seller lines and rejects impossible gross", () => {
  const result = allocateProcessingFeeCents(500, [
    { id: "seller-a-line-1", grossAmountCents: 10000 },
    { id: "seller-a-line-2", grossAmountCents: 5000 },
    { id: "seller-b-line-1", grossAmountCents: 5000 },
  ]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.allocations.get("seller-a-line-1"), 250);
    assert.equal(result.allocations.get("seller-a-line-2"), 125);
    assert.equal(result.allocations.get("seller-b-line-1"), 125);
  }

  assert.equal(
    allocateProcessingFeeCents(1, [{ id: "zero", grossAmountCents: 0 }]).ok,
    false,
  );
});
