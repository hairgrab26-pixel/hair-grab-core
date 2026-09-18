import assert from "node:assert/strict";
import test from "node:test";
import {
  attributesFromTags,
  hydrateSellerAttributes,
  isSameDayShipsWithin,
  normalizeShipsWithin,
  productAttributeTags,
  replaceAttributeTags,
  weftOptionValues,
// @ts-ignore Node's TypeScript stripping requires the explicit extension.
} from "./product-attribute-tags.ts";

test("builds Shopify filter tags as Label: Value", () => {
  assert.deepEqual(
    productAttributeTags({
      laceType: "HD Lace",
      laceSize: "13x4",
      density: "180%",
      selectedOptions: ["WEFT", "SINGLE_BUNDLE"],
      material: "Human Hair",
      texture: "Body Wave",
      colors: ["Natural / 1B", "613 - Blonde"],
      shipsWithin: "Same Day",
      hairCategory: "Wigs",
    }),
    [
      "Material: Human Hair",
      "Texture: Body Wave",
      "Density: 180%",
      "Lace Type: HD Lace",
      "Lace Size: 13x4",
      "Weft: Weft",
      "Color: Natural / 1B",
      "Color: 613 - Blonde",
      "Ships Within: Same Day",
      "Hair Category: Wigs",
    ],
  );
});

test("adds a Same Day filter tag without replacing a timeline", () => {
  assert.deepEqual(
    productAttributeTags({
      shipsWithin: "24 Hours",
      sameDayDelivery: true,
    }),
    ["Ships Within: 24 Hours", "Ships Within: Same Day"],
  );
});

test("skips empty and not-applicable attributes", () => {
  assert.deepEqual(
    productAttributeTags({
      laceType: " ",
      density: "",
      selectedOptions: [],
      material: "Not Applicable",
      texture: "Not Applicable",
      colors: [],
    }),
    [],
  );
});

test("replaces legacy and labeled attribute tags without dropping other tags", () => {
  assert.deepEqual(
    replaceAttributeTags(
      ["HairGrab", "lace:Swiss Lace", "Wigs", "Material: Synthetic Hair"],
      ["Material: Human Hair", "Density: 150%"],
    ).sort(),
    ["Density: 150%", "HairGrab", "Material: Human Hair", "Wigs"].sort(),
  );
});

test("preserves Same Day as a Ships Within filter value", () => {
  assert.equal(normalizeShipsWithin("48 Hours"), "48 Hours");
  assert.equal(normalizeShipsWithin("Same Day"), "Same Day");
  assert.equal(normalizeShipsWithin("3-5 Days"), "3-5 Days");
  assert.equal(isSameDayShipsWithin("Same Day"), true);
});

test("hydrates edit-form attributes from metafield fallbacks and tags", () => {
  const hydrated = hydrateSellerAttributes({
    tags: ["Material: Human Hair", "Weft: No Weft", "Ships Within: Same Day", "Color: 613 - Blonde"],
    metafields: [
      { namespace: "custom", key: "density", value: "180%" },
      { namespace: "custom", key: "lace_type", value: "HD Lace" },
      { namespace: "custom", key: "lace_size", value: "13x4" },
    ],
    named: {
      texture: "Body Wave",
    },
  });

  assert.equal(hydrated.material, "Human Hair");
  assert.equal(hydrated.texture, "Body Wave");
  assert.equal(hydrated.density, "180%");
  assert.equal(hydrated.laceType, "HD Lace");
  assert.equal(hydrated.laceSize, "13x4");
  assert.equal(hydrated.weft, "No Weft");
  assert.deepEqual(hydrated.colors, ["613 - Blonde"]);
  assert.equal(hydrated.shipsWithin, "Same Day");
  assert.equal(hydrated.sameDayDelivery, true);
  assert.deepEqual(weftOptionValues(hydrated.weft), ["NO_WEFT"]);
});

test("reads Lace Type tags that actually store a lace size", () => {
  assert.equal(attributesFromTags(["Lace Type: 13x4"]).laceSize, "13x4");
  assert.equal(attributesFromTags(["Lace Type: HD Lace"]).laceType, "HD Lace");
});
