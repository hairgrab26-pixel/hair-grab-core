import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore
import { configuredSameDayRadiusMiles, DEFAULT_SAME_DAY_RADIUS_MILES, isWithinSameDayRadius, milesBetween, SHIPDAY_SAME_DAY_RADIUS_MILES } from "./same-day-radius.ts";

test("defaults to a 10-mile shopper radius and honors a configured Shipday radius", () => {
  assert.equal(configuredSameDayRadiusMiles({}), DEFAULT_SAME_DAY_RADIUS_MILES);
  assert.equal(configuredSameDayRadiusMiles({ SHIPDAY_DELIVERY_RADIUS_MILES: "30" }), SHIPDAY_SAME_DAY_RADIUS_MILES);
});

test("marks a nearby buyer inside the same-day radius and a far buyer outside", () => {
  const seller = { latitude: 41.3083, longitude: -72.9279 };
  const nearby = { latitude: 41.3273, longitude: -72.978 };
  const far = { latitude: 40.7128, longitude: -74.006 };
  assert.ok(milesBetween(seller, nearby) < 10);
  assert.equal(isWithinSameDayRadius(seller, nearby, 10), true);
  assert.equal(isWithinSameDayRadius(seller, far, 10), false);
  assert.equal(isWithinSameDayRadius(seller, far, 30), false);
});
