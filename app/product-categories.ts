// ==========================================================
// HAIRGRAB CANONICAL PRODUCT CATEGORIES
//
// Single source of truth for the category value HairGrab writes
// to Shopify's `productType` field (and tags) for every seller
// product, kept separate from the SHOPPER-FACING display label
// (see SHOPPER_CATEGORY_LABELS below).
//
// This module intentionally has no side effects and no server
// secrets, so it is safe to import from both route actions
// (server) and route components (client).
//
// Added as part of the Phase 3 product-system repair: the
// category label used to be recomputed independently in
// seller.add-product.tsx (twice) and seller.edit-product.$productId.tsx
// (twice), with slightly different logic in each place. That
// duplication is the leading suspect for the historical
// "Wigs category didn't work while Bundles did" bug: one of the
// duplicated code paths could fall back to the raw internal UI
// label ("Wig", singular) instead of the canonical shopper
// category ("Wigs", plural), while the same fallback for BUNDLE
// happened to already read "Bundles" and so never surfaced a
// problem.
//
// ----------------------------------------------------------
// PHASE 2A SAFETY FIX (do not regress this):
//
// Phase 2A's original implementation changed PRODUCT_CATEGORY_LABELS
// itself to the new shopper-facing text ("Closures + Frontals",
// "Braids + Crochet"). Because seller.add-product.tsx and
// seller.edit-product.$productId.tsx both write Shopify's
// productType field from this exact map (via
// productTypeToCategoryLabel / this map directly), that would have
// silently changed the CANONICAL value written to Shopify --
// breaking any existing collection rule, saved search, tag, or
// report keyed on "Closures & Frontals" / "Braiding Hair".
//
// The fix: PRODUCT_CATEGORY_LABELS stays the CANONICAL, historical
// value -- this is what gets written to Shopify's productType,
// tags, and the Hair Category metafield, and must never change
// without a live data migration. SHOPPER_CATEGORY_LABELS is a
// SEPARATE map holding only the new shopper-facing display text,
// used exclusively by displayProductCategory() /
// productTypeToShopperLabel() for what shoppers see (category
// circles, search/discovery UI). Write-path code must always go
// through PRODUCT_CATEGORY_LABELS / productTypeToCategoryLabel(),
// never SHOPPER_CATEGORY_LABELS / displayProductCategory().
// ----------------------------------------------------------
export type ProductType =
  | "WIG"
  | "BUNDLE"
  | "CLOSURE_FRONTAL"
  | "EXTENSION"
  | "BRAIDING_HAIR"
  | "HAIR_ESSENTIAL";

// The only six CANONICAL values HairGrab should ever write to
// Shopify's productType field, tags, or the Hair Category
// metafield. Never change these strings without a live data
// migration -- existing products, collection rules, and saved
// searches on the shop already depend on this exact text.
//
// normalizeProductCategory() below still recognizes historical
// variants and the current shopper-facing text (see
// SHOPPER_CATEGORY_LABELS) via keyword matching (not exact-label
// matching), so existing products using older strings, or the new
// shopper text, all keep normalizing to this canonical label with
// no data migration required.
export const PRODUCT_CATEGORY_LABELS: Record<ProductType, string> = {
  WIG: "Wigs",
  BUNDLE: "Bundles",
  CLOSURE_FRONTAL: "Closures & Frontals",
  EXTENSION: "Extensions",
  BRAIDING_HAIR: "Braiding Hair",
  HAIR_ESSENTIAL: "Hair Essentials",
};

// Phase 2A relabel: SHOPPER-FACING display text ONLY. Never write
// these strings to Shopify -- they exist purely for what a shopper
// sees (category circles, search/discovery UI copy). Categories not
// touched by the Phase 2A relabel intentionally have the identical
// string in both maps.
export const SHOPPER_CATEGORY_LABELS: Record<ProductType, string> = {
  WIG: "Wigs",
  BUNDLE: "Bundles",
  CLOSURE_FRONTAL: "Closures + Frontals",
  EXTENSION: "Extensions",
  BRAIDING_HAIR: "Braids + Crochet",
  HAIR_ESSENTIAL: "Hair Essentials",
};

export const CANONICAL_PRODUCT_CATEGORIES: string[] = Object.values(
  PRODUCT_CATEGORY_LABELS,
);

const CANONICAL_LABEL_SET = new Set(CANONICAL_PRODUCT_CATEGORIES);

/**
 * The only place HairGrab should map a KNOWN internal ProductType
 * enum value (from a validated Add Product / Edit Product payload)
 * to the CANONICAL value written to Shopify's productType field,
 * tags, and the Hair Category metafield.
 */
export function productTypeToCategoryLabel(
  productType: ProductType,
): string {
  return PRODUCT_CATEGORY_LABELS[productType];
}

/**
 * The SHOPPER-FACING counterpart of productTypeToCategoryLabel().
 * Use this only for display (category circles, UI copy) -- never
 * for anything written back to Shopify.
 */
export function productTypeToShopperLabel(
  productType: ProductType,
): string {
  return SHOPPER_CATEGORY_LABELS[productType];
}

/**
 * Tolerant normalizer for a RAW, possibly-historical Shopify
 * productType string (or any other free-text category value
 * that may already be sitting on a live Shopify product) --
 * including the current shopper-facing text, which must also
 * normalize back to the CANONICAL label.
 *
 * Handles known drift such as "Wig", "WIG", "WIGS", "wigs",
 * "wig ", etc., and always returns one of the six CANONICAL
 * labels when it can confidently recognize the value.
 *
 * Returns null when the value can't be confidently mapped to a
 * canonical category (the caller should fall back to displaying
 * the raw value rather than guessing).
 */
export function normalizeProductCategory(
  raw: string | null | undefined,
): string | null {
  const value = String(raw || "").trim();

  if (!value) {
    return null;
  }

  // Exact ProductType enum value (e.g. "WIG").
  if (Object.prototype.hasOwnProperty.call(PRODUCT_CATEGORY_LABELS, value)) {
    return PRODUCT_CATEGORY_LABELS[value as ProductType];
  }

  // Already the exact canonical label.
  if (CANONICAL_LABEL_SET.has(value)) {
    return value;
  }

  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  if (normalized === "wig" || normalized === "wigs") {
    return PRODUCT_CATEGORY_LABELS.WIG;
  }

  if (normalized === "bundle" || normalized === "bundles") {
    return PRODUCT_CATEGORY_LABELS.BUNDLE;
  }

  if (
    normalized.includes("closure") ||
    normalized.includes("frontal")
  ) {
    return PRODUCT_CATEGORY_LABELS.CLOSURE_FRONTAL;
  }

  if (normalized === "extension" || normalized === "extensions") {
    return PRODUCT_CATEGORY_LABELS.EXTENSION;
  }

  if (
    normalized.includes("braiding") ||
    normalized.includes("braid") ||
    normalized.includes("crochet") ||
    normalized.includes("loc")
  ) {
    return PRODUCT_CATEGORY_LABELS.BRAIDING_HAIR;
  }

  if (normalized.includes("essential")) {
    return PRODUCT_CATEGORY_LABELS.HAIR_ESSENTIAL;
  }

  return null;
}

/**
 * Convenience helper for display contexts that need SOME label
 * no matter what: normalizes to the canonical value first, then
 * maps to the SHOPPER-FACING label for display, otherwise falls
 * back to the raw value (or "Other" when there's nothing at all).
 *
 * SAFETY: this function's return value must never be written back
 * to Shopify's productType, tags, or the Hair Category metafield --
 * use productTypeToCategoryLabel() (or PRODUCT_CATEGORY_LABELS
 * directly) for that.
 */
export function displayProductCategory(
  raw: string | null | undefined,
): string {
  const canonical = normalizeProductCategory(raw);

  if (!canonical) {
    return String(raw || "").trim() || "Other";
  }

  const productType = (
    Object.keys(PRODUCT_CATEGORY_LABELS) as ProductType[]
  ).find((key) => PRODUCT_CATEGORY_LABELS[key] === canonical);

  return productType
    ? SHOPPER_CATEGORY_LABELS[productType]
    : canonical;
}
