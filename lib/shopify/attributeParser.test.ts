import assert from "node:assert/strict";
import test from "node:test";
import { parseAdminProductAttributes } from "./attributeParser.ts";

test("parses the 16 Admin metafields with tag fallbacks", () => {
  const parsed = parseAdminProductAttributes({
    metafields: [
      { key: "weft_type", value: "Double Weft" },
      { key: "density", value: "180%" },
      { key: "origin", value: "Brazilian" },
      { key: "length", value: '["18","20"]' },
      { key: "hair_category", value: "Bundles" },
      { key: "shipping_method", value: "Free Shipping" },
      { key: "color", value: '["Natural / 1B"]' },
      { key: "show_on_hairgrab_map", value: "Yes" },
      { key: "return_policy", value: "14-Day Returns" },
      { key: "ships_within", value: "Same Day" },
      { key: "cap_type", value: "Glueless" },
      { key: "shipping_territory", value: "Nationwide" },
      { key: "ships_from_state", value: "CT" },
      { key: "ships_from_city", value: "New Haven" },
      { key: "hair_type", value: "Human Hair" },
      { key: "texture", value: "Body Wave" },
    ],
  });

  assert.equal(parsed.weftType, "Double Weft");
  assert.equal(parsed.density, "180%");
  assert.equal(parsed.origin, "Brazilian");
  assert.deepEqual(parsed.lengths, ["18", "20"]);
  assert.equal(parsed.hairCategory, "Bundles");
  assert.equal(parsed.shippingMethod, "Free Shipping");
  assert.equal(parsed.showOnMap, "Yes");
  assert.equal(parsed.returnPolicy, "14-Day Returns");
  assert.equal(parsed.shipsWithin, "Same Day");
  assert.equal(parsed.capType, "Glueless");
  assert.equal(parsed.shippingTerritory, "Nationwide");
  assert.equal(parsed.shipsFromState, "CT");
  assert.equal(parsed.shipsFromCity, "New Haven");
  assert.equal(parsed.material, "Human Hair");
  assert.equal(parsed.texture, "Body Wave");
  assert.deepEqual(parsed.colors, ["Natural / 1B"]);
});

test("reads Hair Type and City tags when metafields are missing", () => {
  const parsed = parseAdminProductAttributes({
    tags: ["Hair Type: 100% Human Hair", "City: Hartford", "Weft Type: No Weft", "Ships Within: 48 Hours"],
  });
  assert.equal(parsed.material, "100% Human Hair");
  assert.equal(parsed.shipsFromCity, "Hartford");
  assert.equal(parsed.weftType, "No Weft");
  assert.equal(parsed.shipsWithin, "48 Hours");
});
