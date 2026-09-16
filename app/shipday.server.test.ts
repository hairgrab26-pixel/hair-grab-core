import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { shipday, ShipdayError, shipdayAmountToCents } from "./shipday.server.ts";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { createSameDayQuoteService, sameDaySellerEligible } from "./same-day-delivery.server.ts";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { priceSameDayDelivery } from "./delivery-pricing.server.ts";

const seller = {
  id: "seller-a", businessName: "Seller A", status: "ACTIVE", offersSameDayDelivery: true,
  offersLocalDelivery: false, address1: "101 Private Pickup Street", address2: "Suite 4",
  city: "New York", state: "NY", postalCode: "10005", country: "US", phone: "+12125550123",
};
const destination = {
  address1: "202 Shopper Street", city: "New York", state: "NY", postalCode: "10028", country: "US",
};
const offer = {
  id: "quote-1", name: "Provider", fee: 6.49, error: false,
  pickupTime: "2026-09-15T17:00:00Z", deliveryTime: "2026-09-15T18:00:00Z",
};
const input = { sellerId: seller.id, destination };
const testKey = "test-only-shipday-credential";

function http(t: TestContext, response: unknown = [offer], status = 200) {
  const previous = process.env.SHIPDAY_API_KEY;
  process.env.SHIPDAY_API_KEY = testKey;
  t.after(() => {
    if (previous === undefined) delete process.env.SHIPDAY_API_KEY;
    else process.env.SHIPDAY_API_KEY = previous;
  });
  const calls: { url: string; init: RequestInit }[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(response), { status });
  });
  return calls;
}

test("same-day uses its own flag independently of local delivery", () => {
  assert.equal(sameDaySellerEligible(seller), true);
  assert.equal(sameDaySellerEligible({ ...seller, offersSameDayDelivery: false }), false);
  assert.equal(sameDaySellerEligible({ ...seller, offersLocalDelivery: true, offersSameDayDelivery: false } as typeof seller), false);
  assert.equal(sameDaySellerEligible({ ...seller, status: "SUSPENDED" }), false);
});

test("missing pickup address/contact is rejected before any Shipday call", async (t) => {
  const calls = http(t);
  for (const field of ["address1", "city", "state", "postalCode", "country", "phone", "businessName"]) {
    const quote = createSameDayQuoteService(async () => ({ ...seller, [field]: " " }));
    assert.deepEqual(await quote(input), { available: false, reason: "SELLER_INELIGIBLE", quotes: [] });
  }
  assert.equal(calls.length, 0);
});

test("disabled, inactive, and unknown sellers cannot request availability", async (t) => {
  const calls = http(t);
  for (const record of [null, { ...seller, status: "INACTIVE" }, { ...seller, offersSameDayDelivery: false }]) {
    assert.equal((await createSameDayQuoteService(async () => record)(input)).available, false);
  }
  assert.equal(calls.length, 0);
});

test("live HTTP boundary receives only one stored pickup and one destination", async (t) => {
  const calls = http(t);
  const result = await createSameDayQuoteService(async (id) => {
    assert.equal(id, seller.id);
    return seller;
  })({ ...input, pickupAt: offer.pickupTime, deliveryAt: offer.deliveryTime });
  assert.equal(result.available, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.shipday.com/on-demand/availability");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    pickupAddress: "101 Private Pickup Street, Suite 4, New York, NY, 10005, US",
    deliveryAddress: "202 Shopper Street, New York, NY, 10028, US",
    pickUpTime: "2026-09-15T17:00:00.000Z", deliveryTime: "2026-09-15T18:00:00.000Z",
  });
  if (result.available) {
    assert.equal(result.sellerId, seller.id);
    assert.deepEqual(result.quotes[0], {
      currency: "USD", providerCostCents: 649, shopperChargeCents: 999, expectedMarginCents: 350,
      pricingPolicyVersion: "fixed-markup-v1", provider: "Provider", reference: "quote-1",
      pickupAt: "2026-09-15T17:00:00.000Z", deliveryAt: "2026-09-15T18:00:00.000Z",
    });
  }
});

test("unavailable or invalid fee offers never become free delivery", async (t) => {
  http(t, [{ ...offer, error: true }, { ...offer, fee: null }, { ...offer, fee: "" }, { ...offer, fee: -1 }]);
  assert.deepEqual(await createSameDayQuoteService(async () => seller)(input), {
    available: false, reason: "UNAVAILABLE", quotes: [],
  });
});

test("empty availability response is unavailable", async (t) => {
  http(t, []);
  assert.equal((await createSameDayQuoteService(async () => seller)(input)).available, false);
});

test("$6.49 and $11.49 quotes preserve cost, charge, and $3.50 margin separately", async (t) => {
  http(t, [offer, { ...offer, id: "quote-2", fee: 11.49 }]);
  const result = await createSameDayQuoteService(async () => seller)(input);
  assert.equal(result.available, true);
  if (!result.available) return;
  assert.deepEqual(result.quotes.map(({ providerCostCents, shopperChargeCents, expectedMarginCents }) =>
    [providerCostCents, shopperChargeCents, expectedMarginCents]), [[649, 999, 350], [1149, 1499, 350]]);
});

test("pricing rejects invalid cents and conversion does not coerce missing prices", () => {
  for (const value of [-1, 6.49, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => priceSameDayDelivery(value));
  }
  assert.equal(priceSameDayDelivery(0).shopperChargeCents, 350);
  assert.equal(shipdayAmountToCents("11.49"), 1149);
  for (const value of [null, undefined, "", "garbage", -1, 1.001, Infinity]) {
    assert.equal(shipdayAmountToCents(value), null);
  }
});

test("two sellers require two independent quotes; a seller array is rejected", async (t) => {
  const calls = http(t);
  const other = { ...seller, id: "seller-b", address1: "303 Other Pickup Street" };
  const quote = createSameDayQuoteService(async (id) => id === seller.id ? seller : other);
  const results = await Promise.all([quote(input), quote({ ...input, sellerId: other.id })]);
  assert.equal(calls.length, 2);
  assert.deepEqual(results.map((result) => result.available && result.sellerId), [seller.id, other.id]);
  const pickups = calls.map((call) => JSON.parse(String(call.init.body)).pickupAddress);
  assert.equal(pickups[0].includes(other.address1), false);
  assert.equal(pickups[1].includes(seller.address1), false);
  assert.deepEqual(await quote({ ...input, sellerId: [seller.id, other.id] } as unknown as typeof input), {
    available: false, reason: "INVALID_REQUEST", quotes: [],
  });
  assert.equal(calls.length, 2);
});

test("mismatched storage identity fails closed", async (t) => {
  const calls = http(t);
  const result = await createSameDayQuoteService(async () => ({ ...seller, id: "seller-b" }))(input);
  assert.equal(result.available, false);
  assert.equal(calls.length, 0);
});

test("HTTP errors fail safely without exposing addresses or credentials", async (t) => {
  const calls = http(t, { error: `${testKey} ${seller.address1} ${destination.address1}` }, 401);
  const result = await createSameDayQuoteService(async () => seller)(input);
  assert.deepEqual(result, { available: false, reason: "SERVICE_ERROR", quotes: [] });
  assert.equal(calls.length, 1);
});

test("network and timeout errors are sanitized and not retried", async (t) => {
  http(t);
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => {
    attempts++;
    throw new Error(`${testKey} ${seller.address1}`);
  });
  await assert.rejects(() => shipday.cancel(42), (error: unknown) => {
    assert.ok(error instanceof ShipdayError);
    assert.equal(error.message, "Shipday request failed.");
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(attempts, 1);
});

test("malformed success payload fails safely", async (t) => {
  http(t, { success: false, message: testKey });
  assert.deepEqual(await createSameDayQuoteService(async () => seller)(input), {
    available: false, reason: "SERVICE_ERROR", quotes: [],
  });
});

test("missing key fails safely without HTTP", async (t) => {
  const calls = http(t);
  delete process.env.SHIPDAY_API_KEY;
  assert.equal((await createSameDayQuoteService(async () => seller)(input)).available, false);
  assert.equal(calls.length, 0);
});

test("shopper-safe result strips unknown fields, credentials, and address echoes", async (t) => {
  http(t, [{ ...offer, authorization: testKey, pickupAddress: seller.address1,
    customerAddress: destination.address1, response: { key: testKey } },
  { ...offer, name: testKey }, { ...offer, name: seller.address1 }]);
  const result = await createSameDayQuoteService(async () => seller)(input);
  const serialized = JSON.stringify(result);
  for (const sensitive of [testKey, seller.address1, destination.address1, "authorization", "pickupAddress"]) {
    assert.equal(serialized.includes(sensitive), false);
  }
  assert.equal(result.available, true);
});

test("client-supplied pickup and price have no authority", async (t) => {
  const calls = http(t);
  const result = await createSameDayQuoteService(async () => seller)({
    ...input, providerCostCents: 1, shopperChargeCents: 1, pickupAddress: "attacker pickup",
  } as typeof input);
  assert.equal(JSON.parse(String(calls[0].init.body)).pickupAddress.includes(seller.address1), true);
  assert.ok(result.available);
  assert.equal(result.quotes[0].shopperChargeCents, 999);
});

test("invalid destinations, timing, and unsupported currencies do not call Shipday", async (t) => {
  const calls = http(t);
  const quote = createSameDayQuoteService(async () => seller);
  for (const request of [{ ...input, destination: { ...destination, address1: "" } },
    { ...input, destination: { ...destination, country: "CA" } }, { ...input, pickupAt: "invalid" },
    { ...input, pickupAt: offer.deliveryTime, deliveryAt: offer.pickupTime }]) {
    assert.equal((await quote(request)).available, false);
  }
  assert.equal(calls.length, 0);
});

test("all seven adapter operations use documented methods and authentication", async (t) => {
  const calls = http(t);
  const details = { orderId: 42, id: 99, status: "REQUESTED", thirdPartyFee: 6.49,
    shipdayCharge: 1, totalBillableAmount: 7.49, billable: true, charged: false };
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const response = url.endsWith("/services") ? [{ name: "Provider", status: true, prod: true }] :
      url.endsWith("/orders") ? { success: true, orderId: 42 } :
      url.includes("/cancel/") ? { success: true } :
      url.includes("/details/") || url.endsWith("/assign") ? details : [offer];
    return new Response(JSON.stringify(response));
  });
  await shipday.services();
  await shipday.availability({ pickupAddress: "pickup", deliveryAddress: "destination" });
  await shipday.insertOrder(seller.id, {
    orderNumber: "HGsellerAorder42", customerName: "Customer", customerAddress: "destination",
    customerPhoneNumber: "+12125550456", restaurantName: seller.businessName,
    restaurantAddress: seller.address1, restaurantPhoneNumber: seller.phone,
  }, [{ sellerId: seller.id, name: "Hair", quantity: 2, unitPriceCents: 1299 }]);
  await shipday.estimate(42);
  const assigned = await shipday.assign({ orderId: 42, name: "Provider", estimateReference: "quote-1", tipCents: 250 });
  assert.equal(assigned.providerCostCents, 649);
  assert.equal(assigned.totalBillableAmountCents, 749);
  await shipday.details(42);
  await shipday.cancel(42);
  assert.deepEqual(calls.map((call) => [new URL(call.url).pathname, call.init.method]), [
    ["/on-demand/services", "GET"], ["/on-demand/availability", "POST"], ["/orders", "POST"],
    ["/on-demand/estimate/42", "GET"], ["/on-demand/assign", "POST"],
    ["/on-demand/details/42", "GET"], ["/on-demand/cancel/42", "POST"],
  ]);
  for (const call of calls) {
    const headers = new Headers(call.init.headers);
    assert.equal(headers.get(call.url.endsWith("/orders") ? "x-api-key" : "Authorization"),
      call.url.endsWith("/orders") ? testKey : `Basic ${testKey}`);
    assert.equal(call.init.redirect, "error");
    assert.ok(call.init.signal);
  }
  const insert = JSON.parse(String(calls[2].init.body));
  assert.deepEqual(insert.orderItem, [{ name: "Hair", quantity: 2, unitPrice: 12.99 }]);
  const assignment = JSON.parse(String(calls[4].init.body));
  assert.equal(assignment.tip, 2.5);
  assert.equal("tipCents" in assignment, false);
});

test("insertion rejects mixed-seller items before HTTP", async (t) => {
  const calls = http(t);
  await assert.rejects(() => shipday.insertOrder(seller.id, {} as never, [
    { sellerId: seller.id, name: "A", quantity: 1, unitPriceCents: 100 },
    { sellerId: "seller-b", name: "B", quantity: 1, unitPriceCents: 100 },
  ]), ShipdayError);
  assert.equal(calls.length, 0);
});
