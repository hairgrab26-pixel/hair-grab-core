// ==========================================================
// HAIRGRAB CANONICAL PRODUCT CATEGORIES
//
// Single source of truth for the shopper-facing category label
// that HairGrab writes to Shopify's `productType` field (and
// tags) for every seller product.
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
// ==========================================================

export type ProductType =
  | "WIG"
  | "BUNDLE"
  | "CLOSURE_FRONTAL"
  | "EXTENSION"
  | "BRAIDING_HAIR"
  | "HAIR_ESSENTIAL";

// The only six canonical shopper-facing category labels HairGrab
// should ever write to Shopify's productType field or tags.
export const PRODUCT_CATEGORY_LABELS: Record<ProductType, string> = {
  WIG: "Wigs",
  BUNDLE: "Bundles",
  CLOSURE_FRONTAL: "Closures & Frontals",
  EXTENSION: "Extensions",
  BRAIDING_HAIR: "Braiding Hair",
  HAIR_ESSENTIAL: "Hair Essentials",
};

export const CANONICAL_PRODUCT_CATEGORIES: string[] = Object.values(
  PRODUCT_CATEGORY_LABELS,
);

const CANONICAL_LABEL_SET = new Set(CANONICAL_PRODUCT_CATEGORIES);

/**
 * The only place HairGrab should map a KNOWN internal ProductType
 * enum value (from a validated Add Product / Edit Product payload)
 * to the canonical shopper-facing category label.
 */
export function productTypeToCategoryLabel(
  productType: ProductType,
): string {
  return PRODUCT_CATEGORY_LABELS[productType];
}

/**
 * Tolerant normalizer for a RAW, possibly-historical Shopify
 * productType string (or any other free-text category value
 * that may already be sitting on a live Shopify product).
 *
 * Handles known drift such as "Wig", "WIG", "WIGS", "wigs",
 * "wig ", etc., and always returns one of the six canonical
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
    normalized.includes("braid")
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
 * no matter what: normalizes when possible, otherwise falls back
 * to the raw value (or "Other" when there's nothing at all).
 */
export function displayProductCategory(
  raw: string | null | undefined,
): string {
  return (
    normalizeProductCategory(raw) ||
    String(raw || "").trim() ||
    "Other"
  );
}
