import assert from "node:assert/strict";
import test from "node:test";
import {
  CANONICAL_PRODUCT_CATEGORIES,
  displayProductCategory,
  normalizeProductCategory,
  PRODUCT_CATEGORY_LABELS,
  productTypeToCategoryLabel,
  productTypeToShopperLabel,
  SHOPPER_CATEGORY_LABELS,
  type ProductType,
// @ts-ignore Node's TypeScript stripping requires the explicit extension.
} from "./product-categories.ts";

// ----------------------------------------------------------
// Safety-review fix: the Phase 2A relabel must change only what
// SHOPPERS see, never the CANONICAL value written to Shopify's
// productType field, tags, or the Hair Category metafield.
// ----------------------------------------------------------

test("canonical Shopify productType values are unchanged by the Phase 2A relabel", () => {
  assert.equal(PRODUCT_CATEGORY_LABELS.CLOSURE_FRONTAL, "Closures & Frontals");
  assert.equal(PRODUCT_CATEGORY_LABELS.BRAIDING_HAIR, "Braiding Hair");
});

test("shopper-facing labels reflect the Phase 2A relabel, and unaffected categories are identical in both maps", () => {
  assert.equal(SHOPPER_CATEGORY_LABELS.CLOSURE_FRONTAL, "Closures + Frontals");
  assert.equal(SHOPPER_CATEGORY_LABELS.BRAIDING_HAIR, "Braids + Crochet");
  assert.equal(SHOPPER_CATEGORY_LABELS.WIG, PRODUCT_CATEGORY_LABELS.WIG);
  assert.equal(SHOPPER_CATEGORY_LABELS.BUNDLE, PRODUCT_CATEGORY_LABELS.BUNDLE);
  assert.equal(SHOPPER_CATEGORY_LABELS.EXTENSION, PRODUCT_CATEGORY_LABELS.EXTENSION);
  assert.equal(SHOPPER_CATEGORY_LABELS.HAIR_ESSENTIAL, PRODUCT_CATEGORY_LABELS.HAIR_ESSENTIAL);
});

test("internal enum identifiers are unchanged", () => {
  assert.deepEqual(Object.keys(PRODUCT_CATEGORY_LABELS), [
    "WIG", "BUNDLE", "CLOSURE_FRONTAL", "EXTENSION", "BRAIDING_HAIR", "HAIR_ESSENTIAL",
  ]);
  assert.deepEqual(Object.keys(SHOPPER_CATEGORY_LABELS), [
    "WIG", "BUNDLE", "CLOSURE_FRONTAL", "EXTENSION", "BRAIDING_HAIR", "HAIR_ESSENTIAL",
  ]);
});

test("there are exactly six canonical categories (Shop All is never one of them)", () => {
  assert.equal(CANONICAL_PRODUCT_CATEGORIES.length, 6);
  assert.ok(!CANONICAL_PRODUCT_CATEGORIES.includes("Shop All"));
  assert.ok(!CANONICAL_PRODUCT_CATEGORIES.includes("Closures + Frontals"));
  assert.ok(!CANONICAL_PRODUCT_CATEGORIES.includes("Braids + Crochet"));
});

test("historical and shopper-facing raw values all normalize to the CANONICAL label, never the shopper label", () => {
  // Pre-Phase-2A / current canonical label text.
  assert.equal(normalizeProductCategory("Closures & Frontals"), "Closures & Frontals");
  assert.equal(normalizeProductCategory("Braiding Hair"), "Braiding Hair");
  // The NEW shopper-facing text must also normalize back to canonical.
  assert.equal(normalizeProductCategory("Closures + Frontals"), "Closures & Frontals");
  assert.equal(normalizeProductCategory("Braids + Crochet"), "Braiding Hair");
  // Enum-style and case/whitespace drift, already supported before this change.
  assert.equal(normalizeProductCategory("WIG"), "Wigs");
  assert.equal(normalizeProductCategory(" wigs "), "Wigs");
  assert.equal(normalizeProductCategory("Wig"), "Wigs");
  assert.equal(normalizeProductCategory("bundles"), "Bundles");
  // Classification-adjacent historical values must keep mapping to the
  // canonical Braiding Hair label, never the shopper text.
  assert.equal(normalizeProductCategory("Crochet Hair"), "Braiding Hair");
  assert.equal(normalizeProductCategory("Locs"), "Braiding Hair");
  assert.equal(normalizeProductCategory("Locs / Locks"), "Braiding Hair");
});

test("the current canonical labels normalize to themselves", () => {
  for (const label of CANONICAL_PRODUCT_CATEGORIES) {
    assert.equal(normalizeProductCategory(label), label);
  }
});

test("unrecognized values return null instead of a guess", () => {
  assert.equal(normalizeProductCategory("Nail Polish"), null);
  assert.equal(normalizeProductCategory(""), null);
  assert.equal(normalizeProductCategory(null), null);
  assert.equal(normalizeProductCategory(undefined), null);
});

test("displayProductCategory returns the SHOPPER-facing label, falling back to the raw value then Other, but never guessing", () => {
  assert.equal(displayProductCategory("Closures & Frontals"), "Closures + Frontals");
  assert.equal(displayProductCategory("Braiding Hair"), "Braids + Crochet");
  assert.equal(displayProductCategory("Braids + Crochet"), "Braids + Crochet");
  assert.equal(displayProductCategory("Wigs"), "Wigs");
  assert.equal(displayProductCategory("Some Unmapped Value"), "Some Unmapped Value");
  assert.equal(displayProductCategory(""), "Other");
  assert.equal(displayProductCategory(null), "Other");
});

// ----------------------------------------------------------
// The bug this safety review caught and fixed: seller.add-product.tsx
// and seller.edit-product.$productId.tsx must write the CANONICAL
// value to Shopify's productType field, never the shopper label.
// ----------------------------------------------------------

test("new products write the approved existing canonical Shopify productType values, not the new shopper labels", () => {
  assert.equal(productTypeToCategoryLabel("CLOSURE_FRONTAL"), "Closures & Frontals");
  assert.equal(productTypeToCategoryLabel("BRAIDING_HAIR"), "Braiding Hair");
  assert.notEqual(productTypeToCategoryLabel("CLOSURE_FRONTAL"), "Closures + Frontals");
  assert.notEqual(productTypeToCategoryLabel("BRAIDING_HAIR"), "Braids + Crochet");
  // The shopper-facing helper is the ONLY place that should ever
  // return the new text -- it must stay separate from the write path.
  assert.equal(productTypeToShopperLabel("CLOSURE_FRONTAL"), "Closures + Frontals");
  assert.equal(productTypeToShopperLabel("BRAIDING_HAIR"), "Braids + Crochet");
});

test("editing an existing product does not drift its Shopify productType away from what's already live", () => {
  // Simulates seller.edit-product.$productId.tsx's write path: an
  // existing product with the historical canonical value must be
  // re-saved with that same canonical value, not silently migrated
  // to the new shopper text.
  const existingLiveProductType = "Closures & Frontals";
  const category = normalizeProductCategory(existingLiveProductType);
  assert.ok(category);
  const productType = (Object.keys(PRODUCT_CATEGORY_LABELS) as ProductType[]).find(
    (key) => PRODUCT_CATEGORY_LABELS[key] === category,
  );
  assert.ok(productType);
  const rewritten = productTypeToCategoryLabel(productType as ProductType);
  assert.equal(rewritten, existingLiveProductType);
});
