import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore Node strip-types imports
import { createCarrierRateHandler } from "./same-day-carrier.server.ts";
// @ts-ignore Node strip-types imports
import { readyMapping } from "./same-day-test-fixtures.ts";
// @ts-ignore Node strip-types imports
import { fingerprint, normalizePickup } from "./same-day-provisioning-state.server.ts";

const destination = { address1: "1 Main", city: "New Haven", province: "CT", postal_code: "06510", country: "US" };
const seller = { id: "seller-a", ...readyMapping("seller-a"), status: "ACTIVE", offersSameDayDelivery: true, businessName: "A", phone: "+12035550123", address1: "Private", city: "New Haven", state: "CT", postalCode: "06510", country: "US" };
Object.assign(seller.sameDayProvisioningData.fingerprints, { pickup: fingerprint(normalizePickup(seller)) });
const request = (items: {product_id: string; quantity?: number}[] = [{ product_id: "gid://shopify/Product/1", quantity: 1 }]) => ({ rate: { currency: "USD", destination, items } });

test("carrier callback returns live quote plus 350 cents and no private data", async () => {
  let called = 0;
  const handler = createCarrierRateHandler(async () => { called++; return { available: true, sellerId: seller.id, quotedAt: new Date().toISOString(), quotes: [{ provider: "Courier", reference: "r", pickupAt: null, deliveryAt: null, providerCostCents: 899, shopperChargeCents: 1249, expectedMarginCents: 350, currency: "USD", pricingPolicyVersion: "fixed-markup-v1" }] }; }, async () => [{ shopifyProductId: "gid://shopify/Product/1", sellerId: seller.id, seller }]);
  const result = await handler(request());
  assert.equal(called, 1);
  assert.equal(result.rates[0].total_price, "1249");
  assert.equal(JSON.stringify(result).includes("Private"), false);
});
test("multi-seller and malformed or unsupported requests fail closed", async () => {
  const handler = createCarrierRateHandler(async () => { throw new Error("must not call"); }, async () => [
    { shopifyProductId: "gid://shopify/Product/1", sellerId: "a", seller: { ...seller, id: "a" } },
    { shopifyProductId: "gid://shopify/Product/2", sellerId: "b", seller: { ...seller, id: "b" } },
  ]);
  assert.deepEqual(await handler(request([{ product_id: "1" }, { product_id: "2" }])), { rates: [] });
  assert.deepEqual(await handler({ rate: { currency: "EUR", destination, items: [{ product_id: "1" }] } }), { rates: [] });
  assert.deepEqual(await handler({}), { rates: [] });
});
test("a legitimate carrier request does not require webhook HMAC", async () => {
  const handler = createCarrierRateHandler(async () => ({ available: true, sellerId: seller.id, quotedAt: new Date().toISOString(), quotes: [{ provider: "Courier", reference: "r", pickupAt: null, deliveryAt: null, providerCostCents: 899, shopperChargeCents: 1249, expectedMarginCents: 350, currency: "USD", pricingPolicyVersion: "fixed-markup-v1" }] }), async () => [{ shopifyProductId: "gid://shopify/Product/1", sellerId: seller.id, seller }]);
  const result = await handler(request());
  assert.equal(result.rates[0].total_price, "1249");
});
for (const status of ["NOT_STARTED", "PROVISIONING", "FAILED", "DISABLED"]) test(`carrier refuses ${status} before requesting a live quote`, async () => {
  const handler = createCarrierRateHandler(async () => { throw new Error("quote must not run"); }, async () => [{ shopifyProductId: "1", sellerId: seller.id, seller: { ...seller, sameDayProvisioningStatus: status } }]);
  assert.deepEqual(await handler(request()), { rates: [] });
});
test("carrier refuses incomplete gates, changed pickup, missing identities and disable during quote", async () => {
  for (const changed of [{ shopifyFulfillmentServiceId: null }, { address1: "changed" }, { offersSameDayDelivery: false },
    { sameDayProvisioningData: { ...seller.sameDayProvisioningData, completed: ["eligibility"] } }]) {
    const handler = createCarrierRateHandler(async () => { throw new Error("quote must not run"); }, async () => [{ shopifyProductId: "1", sellerId: seller.id, seller: { ...seller, ...changed } }]);
    assert.deepEqual(await handler(request()), { rates: [] });
  }
  let enabled = true;
  const handler = createCarrierRateHandler(async () => { enabled = false; return { available: true, sellerId: seller.id, quotedAt: new Date().toISOString(), quotes: [{ provider: "Courier", reference: "r", pickupAt: null, deliveryAt: null, providerCostCents: 899, shopperChargeCents: 1249, expectedMarginCents: 350, currency: "USD", pricingPolicyVersion: "fixed-markup-v1" }] }; }, async () => [{ shopifyProductId: "1", sellerId: seller.id, seller: { ...seller, offersSameDayDelivery: enabled } }]);
  assert.deepEqual(await handler(request()), { rates: [] });
});
