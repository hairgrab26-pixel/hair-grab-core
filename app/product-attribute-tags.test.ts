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
      capSize: "Medium",
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
      "Hair Material: Human Hair",
      "Texture: Body Wave",
      "Density: 180%",
      "Lace Type: HD Lace",
      "Lace Size: 13x4",
      "Cap Size: Medium",
      "Cap Type: Medium",
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

test("hydrates Density and Cap Size from tags, JSON metafields, and numeric density", () => {
  const fromTags = attributesFromTags(["Density: 180%", "Cap Size: Medium"]);
  assert.equal(fromTags.density, "180%");
  assert.equal(fromTags.capSize, "Medium");
  assert.equal(attributesFromTags(["Cap Type: Large"]).capSize, "Large");

  const hydrated = hydrateSellerAttributes({
    tags: ["Density: 150%", "Cap Size: Small"],
    metafields: [
      { namespace: "custom", key: "density", value: '["180"]' },
      { namespace: "custom", key: "cap_size", value: "Medium" },
    ],
    named: {
      density: "",
      capSize: "",
    },
  });

  assert.equal(hydrated.density, "180%");
  assert.equal(hydrated.capSize, "Medium");
});

test("builds filter tags for extensions, bundles, and closures", () => {
  assert.deepEqual(
    productAttributeTags({
      productType: "EXTENSION",
      material: "Human Hair",
      texture: "Straight",
      colors: ["Natural / 1B"],
      lengths: ["18"],
      bundleWeight: "100g",
      extensionType: "Tape-Ins",
      shipsWithin: "Same Day",
      hairCategory: "Extensions",
    }).filter((tag) => tag.startsWith("Extension Type:") || tag.startsWith("Weight:") || tag.startsWith("Length:") || tag.startsWith("Hair Category:")),
    [
      "Length: 18",
      "Length: 18 Inch",
      "Weight: 100g",
      "Extension Type: Tape-Ins",
      "Extension Type: Tape-In",
      "Hair Category: Extensions",
    ],
  );

  assert.ok(productAttributeTags({
    productType: "BUNDLE",
    material: "Human Hair",
    bundleWeight: "120g",
    hairCategory: "Bundles",
  }).includes("Bundle Weight: 120g"));

  assert.deepEqual(
    productAttributeTags({
      productType: "CLOSURE_FRONTAL",
      styleTypes: ["Frontal"],
      laceSize: "13x4",
      laceType: "HD Lace",
      hairCategory: "Closures & Frontals",
    }).filter((tag) => tag.startsWith("Type:") || tag.startsWith("Lace ") || tag.startsWith("Hair Category:")),
    [
      "Lace Type: HD Lace",
      "Lace Size: 13x4",
      "Type: Frontal",
      "Hair Category: Closures & Frontals",
    ],
  );
});

test("hydrates Cap Type construction separately from Cap Size", () => {
  const hydrated = hydrateSellerAttributes({
    tags: ["Cap Size: Medium", "Cap Type: Glueless", "Length: 16 Inch", "Weight: 100g", "Extension Type: Clip-Ins"],
  });
  assert.equal(hydrated.capSize, "Medium");
  assert.equal(hydrated.capType, "Glueless");
  assert.deepEqual(hydrated.lengths, ["16"]);
  assert.equal(hydrated.bundleWeight, "100g");
  assert.equal(hydrated.extensionType, "Clip-Ins");
});
