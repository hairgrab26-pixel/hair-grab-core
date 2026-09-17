import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
// @ts-ignore Node strip-types imports
import { createSameDayQuoteService, type SameDaySeller } from "./same-day-delivery.server.ts";

// createSameDayQuoteService takes its seller reader as a dependency, so this
// exercises the real checkout-quote gate (sellerIsOpenAt) end to end without
// a database, mirroring how same-day-carrier.server.test.ts injects fakes.

const destination = { address1: "1 Main", city: "New Haven", state: "CT", postalCode: "06510", country: "US" };
const baseSeller: SameDaySeller = {
  id: "seller-a", status: "ACTIVE", offersSameDayDelivery: true, businessName: "Seller A",
  phone: "+12035550123", address1: "101 Pickup St", address2: null, city: "New Haven", state: "CT",
  postalCode: "06510", country: "US",
  useStoreHours: false, storeOpenOverride: "AUTO", timezone: null, storeHours: [],
} as unknown as SameDaySeller;

function mockShipdayAvailability(t: TestContext) {
  const priorKey = process.env.SHIPDAY_API_KEY;
  process.env.SHIPDAY_API_KEY = "quote-gate-test-only";
  t.after(() => { if (priorKey === undefined) delete process.env.SHIPDAY_API_KEY; else process.env.SHIPDAY_API_KEY = priorKey; });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response(JSON.stringify([{ id: "r", name: "Courier", fee: 8.99, error: false, pickupTime: null, deliveryTime: null }]));
  });
  return { calls: () => calls };
}

test("a seller who never enabled store hours can be quoted at any time (real provider call still runs)", async (t) => {
  const provider = mockShipdayAvailability(t);
  const quote = createSameDayQuoteService(async () => baseSeller);
  const result = await quote({ sellerId: "seller-a", destination });
  assert.equal(result.available, true);
  assert.equal(provider.calls(), 1);
});

test("STORE_CLOSED is returned, and no provider call is made, when the manual override is CLOSED", async (t) => {
  const provider = mockShipdayAvailability(t);
  const seller = { ...baseSeller, storeOpenOverride: "CLOSED" };
  const quote = createSameDayQuoteService(async () => seller);
  const result = await quote({ sellerId: "seller-a", destination });
  assert.deepEqual(result, { available: false, reason: "STORE_CLOSED", quotes: [] });
  assert.equal(provider.calls(), 0);
});

test("STORE_CLOSED, and no provider call, when useStoreHours is on and today is flagged closed", async (t) => {
  const provider = mockShipdayAvailability(t);
  const seller = {
    ...baseSeller, useStoreHours: true, timezone: "America/New_York",
    storeHours: [{ dayOfWeek: new Date().getDay(), isClosed: true, openTime: null, closeTime: null }],
  };
  const quote = createSameDayQuoteService(async () => seller);
  const result = await quote({ sellerId: "seller-a", destination });
  assert.deepEqual(result, { available: false, reason: "STORE_CLOSED", quotes: [] });
  assert.equal(provider.calls(), 0);
});

test("STORE_CLOSED, and no provider call, when useStoreHours is on but no timezone has been saved", async (t) => {
  const provider = mockShipdayAvailability(t);
  const seller = {
    ...baseSeller, useStoreHours: true, timezone: null,
    storeHours: [{ dayOfWeek: new Date().getDay(), isClosed: false, openTime: "00:00", closeTime: "23:59" }],
  };
  const quote = createSameDayQuoteService(async () => seller);
  const result = await quote({ sellerId: "seller-a", destination });
  assert.deepEqual(result, { available: false, reason: "STORE_CLOSED", quotes: [] });
  assert.equal(provider.calls(), 0);
});

test("a seller ineligible on business grounds reports SELLER_INELIGIBLE, not STORE_CLOSED", async (t) => {
  const provider = mockShipdayAvailability(t);
  const seller = { ...baseSeller, status: "SUSPENDED", storeOpenOverride: "CLOSED" as const };
  const quote = createSameDayQuoteService(async () => seller);
  const result = await quote({ sellerId: "seller-a", destination });
  assert.deepEqual(result, { available: false, reason: "SELLER_INELIGIBLE", quotes: [] });
  assert.equal(provider.calls(), 0);
});
