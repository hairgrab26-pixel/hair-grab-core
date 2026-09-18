import assert from "node:assert/strict";
import test from "node:test";
import {
  isSameDayShipsWithin,
  normalizeShipsWithin,
  productAttributeTags,
  replaceAttributeTags,
// @ts-ignore Node's TypeScript stripping requires the explicit extension.
} from "./product-attribute-tags.ts";

test("builds prefixed Shopify tags from completed seller attributes", () => {
  assert.deepEqual(
    productAttributeTags({
      laceType: "HD Lace",
      density: "180%",
      selectedOptions: ["WEFT", "SINGLE_BUNDLE"],
      material: "Human Hair",
      texture: "Body Wave",
      colors: ["Natural / 1B", "613 - Blonde"],
    }),
    [
      "lace:HD Lace",
      "density:180%",
      "weft:Weft",
      "material:Human Hair",
      "texture:Body Wave",
      "color:Natural / 1B",
      "color:613 - Blonde",
    ],
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

test("replaces previous prefixed attribute tags without dropping other tags", () => {
  assert.deepEqual(
    replaceAttributeTags(
      ["HairGrab", "lace:Swiss Lace", "Wigs", "color:Red"],
      ["lace:HD Lace", "density:150%"],
    ).sort(),
    ["HairGrab", "Wigs", "density:150%", "lace:HD Lace"].sort(),
  );
});

test("keeps Ships Within as a static timeline and treats Same Day separately", () => {
  assert.equal(normalizeShipsWithin("48 Hours"), "48 Hours");
  assert.equal(normalizeShipsWithin("Same Day"), "24 Hours");
  assert.equal(isSameDayShipsWithin("Same Day"), true);
  assert.equal(isSameDayShipsWithin("48 Hours"), false);
});
