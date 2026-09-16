import assert from "node:assert/strict";
import test from "node:test";
import { reconcileActualShopifyDeliveryCharge, reconcileSellerOrder } from "./same-day-reconciliation.server.ts";
// @ts-ignore Node strip-types imports
import type { DispatchOrder } from "./same-day-order.server.ts";
test("post-order Shopify shipping line is authoritative", () => {
  const result = reconcileActualShopifyDeliveryCharge({ sellerLocationId: "loc-a", sellerId: "a", sameDayServiceCode: "hairgrab_same_day_a", shippingLines: [{ code: "hairgrab_same_day_a", price: "12.49" }], fulfillmentOrders: [{ assignedLocationId: "loc-a", sellerId: "a" }] });
  assert.deepEqual(result, { status: "RECONCILED", actualShopifyDeliveryChargeCents: 1249 });
});
test("ambiguous seller charge fails closed", () => {
  assert.equal(reconcileActualShopifyDeliveryCharge({ sellerLocationId: "loc-a", sellerId: "a", sameDayServiceCode: "x", shippingLines: [{ code: "x", price: "1.00" }], fulfillmentOrders: [] }).status, "AMBIGUOUS");
});

function orderFixture(overrides: Partial<DispatchOrder["fulfillmentOrders"][number]> = {}): DispatchOrder {
  return {
    id: "42", name: "#42", paid: true, cancelled: false, currency: "USD", destination: null, lines: [],
    shippingLines: [{ code: "hairgrab_same_day_seller-a", title: "Same-Day", source: null, price: "12.49" }],
    fulfillmentOrders: [{
      id: "fo-1", status: "OPEN", requestStatus: "ACCEPTED", locationId: "loc-a",
      actions: ["CREATE_FULFILLMENT"], lines: [{ id: "fol-1", lineId: "1", quantity: 2 }],
      ...overrides,
    }],
  };
}
test("reconcileSellerOrder attributes the exact fulfillment order and charge for a ready seller", () => {
  const result = reconcileSellerOrder(orderFixture(), "seller-a", "loc-a", ["1"]);
  assert.deepEqual(result, { fulfillmentOrderId: "fo-1", actualShopifyDeliveryChargeCents: 1249 });
});
test("reconcileSellerOrder fails closed when no single fulfillment order owns every requested line", () => {
  const twoOrders = orderFixture();
  twoOrders.fulfillmentOrders.push({ id: "fo-2", status: "OPEN", requestStatus: "ACCEPTED", locationId: "loc-b",
    actions: ["CREATE_FULFILLMENT"], lines: [{ id: "fol-2", lineId: "1", quantity: 1 }] });
  assert.throws(() => reconcileSellerOrder(twoOrders, "seller-a", "loc-a", ["1"]), /AMBIGUOUS_FULFILLMENT_ASSIGNMENT/);
  assert.throws(() => reconcileSellerOrder(orderFixture(), "seller-a", "loc-a", []), /AMBIGUOUS_FULFILLMENT_ASSIGNMENT/);
});
test("reconcileSellerOrder fails closed on a foreign location or a mismatched line set", () => {
  assert.throws(() => reconcileSellerOrder(orderFixture(), "seller-a", "loc-other", ["1"]), /SELLER_LOCATION_MISMATCH/);
  const extraLine = orderFixture({ lines: [{ id: "fol-1", lineId: "1", quantity: 2 }, { id: "fol-3", lineId: "2", quantity: 1 }] });
  assert.throws(() => reconcileSellerOrder(extraLine, "seller-a", "loc-a", ["1"]), /SELLER_LOCATION_MISMATCH/);
  assert.throws(() => reconcileSellerOrder(orderFixture(), "seller-a", "loc-a", ["1", "2"]), /SELLER_LOCATION_MISMATCH/);
});
test("reconcileSellerOrder requires an accepted, open fulfillment request by default but not for booking-time reconciliation", () => {
  const notReady = orderFixture({ status: "CLOSED" });
  assert.throws(() => reconcileSellerOrder(notReady, "seller-a", "loc-a", ["1"]), /FULFILLMENT_REQUEST_NOT_READY/);
  const result = reconcileSellerOrder(notReady, "seller-a", "loc-a", ["1"], false);
  assert.deepEqual(result, { fulfillmentOrderId: "fo-1", actualShopifyDeliveryChargeCents: 1249 });
});
test("reconcileSellerOrder fails closed when the shipping-line charge cannot be attributed to one seller", () => {
  const ambiguous = orderFixture(); ambiguous.shippingLines.push({ code: "hairgrab_same_day_seller-a", title: "Same-Day", source: null, price: "9.99" });
  assert.throws(() => reconcileSellerOrder(ambiguous, "seller-a", "loc-a", ["1"]), /AMBIGUOUS_DELIVERY_CHARGE/);
});
