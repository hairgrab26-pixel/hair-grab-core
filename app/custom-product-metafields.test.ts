import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore
import { customSearchDiscoveryMetafields, serializeCustomListMetafieldValue } from "./custom-product-metafields.ts";

test("serializes Search & Discovery metafields as clean JSON arrays", () => {
  assert.equal(serializeCustomListMetafieldValue(["Same Day Delivery"]), '["Same Day Delivery"]');
  const metafields = customSearchDiscoveryMetafields({
    shipsWithin: "Same Day",
    laceType: "HD Lace",
    capType: ["Glueless"],
    density: "180%",
    laceSize: "13x4",
  });
  assert.deepEqual(
    Object.fromEntries(metafields.map((item) => [item.key, item.value])),
    {
      ships_within: '["Same Day Delivery"]',
      lace_type: '["HD Lace"]',
      cap_type: '["Glueless"]',
      density: '["180%"]',
      lace_size: '["13x4"]',
    },
  );
});
