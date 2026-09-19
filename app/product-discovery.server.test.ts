import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore Node's TypeScript stripping requires the explicit extension.
import { discoverProducts, normalizeDiscoveryText, parseDiscoveryParams, type DiscoveryProduct } from "./product-discovery.server.ts";

const products: DiscoveryProduct[] = [
  { id: "1", title: "24 inch Body Wave Wig", handle: "one", category: "Wigs", subtype: "Glueless", texture: "Body Wave", origin: "Brazilian", laceSize: "13x4", laceTypes: ["HD Lace"], lengths: ["24"], colors: ["Natural"], priceCents: 28000, compareAtPriceCents: null, shipsWithin: "24 hours", fulfillment: ["Nationwide Shipping"], seller: "A", sellerCode: "A", city: "Atlanta", state: "GA", available: true, createdAt: "2026-01-02", imageUrl: null },
  { id: "2", title: "Burgundy Body Wave Bundles", handle: "two", category: "Bundles", subtype: "", texture: "Body Wave", origin: "Peruvian", laceSize: "", laceTypes: [], lengths: ["20"], colors: ["Burgundy"], priceCents: 19000, compareAtPriceCents: null, shipsWithin: "2 days", fulfillment: ["Local Pickup"], seller: "B", sellerCode: "B", city: "Miami", state: "FL", available: true, createdAt: "2026-01-01", imageUrl: null },
];

test("normalizes inches and casing", () => {
  assert.equal(normalizeDiscoveryText('24" INCHES'), "24 inch");
  assert.equal(normalizeDiscoveryText("24\u2033"), "24 inch");
});
test("matches natural search with category", () => {
  const params = parseDiscoveryParams(new URL("https://hairgrab.test/?q=24%20inch%20body%20wave%20wig&category=Wigs"));
  assert.deepEqual(discoverProducts(products, params).products.map((p) => p.id), ["1"]);
});
test("filters price and fulfillment", () => {
  const params = parseDiscoveryParams(new URL("https://hairgrab.test/?minPrice=100&maxPrice=200&fulfillment=Local%20Pickup&sort=price_desc"));
  assert.deepEqual(discoverProducts(products, params).products.map((p) => p.id), ["2"]);
});
test("paginates and reports the displayed result count", () => {
  const params = parseDiscoveryParams(new URL("https://hairgrab.test/?pageSize=1"));
  const result = discoverProducts(products, params);
  assert.equal(result.total, 2); assert.equal(result.products.length, 1); assert.equal(result.totalPages, 2);
});
test("filters Origin, Lace Size, and Lace Type from custom metafield-backed fields", () => {
  const params = parseDiscoveryParams(new URL("https://hairgrab.test/?origin=Brazilian&laceSize=13x4&laceType=HD%20Lace"));
  assert.deepEqual(discoverProducts(products, params).products.map((p) => p.id), ["1"]);
});

