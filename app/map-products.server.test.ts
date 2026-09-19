import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore
import { buildMapProductsGeoJson } from "./map-products.server.ts";

test("GeoJSON pins set isSameDayEligible when a Same Day product is inside the shopper radius", () => {
  const products = [{
    id: "gid://shopify/Product/1",
    title: "HD Wig",
    handle: "hd-wig",
    imageUrl: null,
    priceCents: 25000,
    seller: "New Haven Hair",
    sellerCode: "HG-1",
    city: "New Haven",
    state: "CT",
    shipsWithin: '["Same Day Delivery"]',
    tags: ["Ships Within: Same Day"],
    latitude: 41.3083,
    longitude: -72.9279,
  }, {
    id: "gid://shopify/Product/2",
    title: "Bundles",
    handle: "bundles",
    imageUrl: null,
    priceCents: 12000,
    seller: "New Haven Hair",
    sellerCode: "HG-1",
    city: "New Haven",
    state: "CT",
    shipsWithin: "24 Hours",
    latitude: 41.3083,
    longitude: -72.9279,
  }];
  const nearby = buildMapProductsGeoJson(products, { latitude: 41.3273, longitude: -72.978 }, 10);
  assert.equal(nearby.features[0].properties.isSameDayProduct, true);
  assert.equal(nearby.features[0].properties.isSameDayEligible, true);
  assert.equal(nearby.features[1].properties.isSameDayEligible, false);

  const far = buildMapProductsGeoJson(products, { latitude: 40.7128, longitude: -74.006 }, 10);
  assert.equal(far.features[0].properties.isSameDayEligible, false);
});
