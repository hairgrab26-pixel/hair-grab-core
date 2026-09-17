// ==========================================================
// HAIRGRAB SHARED PRODUCT-ATTRIBUTE VOCABULARY
//
// Added in the Phase 2A category/filtering work. These lists used
// to live only as private, unexported consts inside
// ../components/ProductBuilder.tsx, which meant nothing outside
// that one file (the CSV importer's structured-column validation,
// or any test) could check a value against the exact same
// controlled vocabulary the seller form uses. Extracting them here
// (plain data, no JSX, no side effects) lets ProductBuilder.tsx,
// app/csv-product-import.ts, and their tests all import the same
// arrays instead of each keeping their own copy in sync by hand —
// the same duplication risk ../product-categories.ts's own header
// comment warns about for category labels.
//
// Nothing here changes behavior on its own: ProductBuilder.tsx is
// updated in the same change to import these instead of declaring
// them locally, so the seller form's rendered choices are
// unchanged.
// ==========================================================

export const materials = [
  "Human Hair",
  "Synthetic Hair",
  "Human / Synthetic Blend",
  "Other",
  "Not Applicable",
];

export const colors = [
  "Natural / 1B",
  "1 - Jet Black",
  "2 - Dark Brown",
  "4 - Medium Brown",
  "27 - Honey Blonde",
  "30 - Auburn",
  "613 - Blonde",
  "99J - Burgundy",
  "Red",
  "Copper",
  "Pink",
  "Blue",
  "Purple",
  "Gray / Silver",
  "Mixed / Highlighted",
  "Other / Custom",
];

export const textures = [
  "Straight",
  "Body Wave",
  "Loose Wave",
  "Deep Wave",
  "Water Wave",
  "Curly",
  "Deep Curly",
  "Kinky Curly",
  "Kinky Straight",
  "Coily",
  "Other",
];

export const standardLengths = [
  "8",
  "10",
  "12",
  "14",
  "16",
  "18",
  "20",
  "22",
  "24",
  "26",
  "28",
  "30",
  "32",
  "34",
  "36",
  "40",
];

export const densities = [
  "130%",
  "150%",
  "180%",
  "200%",
  "250%",
];

export const laceSizes = [
  "2x6",
  "4x4",
  "5x5",
  "6x6",
  "7x7",
  "13x4",
  "13x6",
  "360",
  "Full Lace",
];

export const laceTypes = [
  "HD Lace",
  "Transparent Lace",
  "Swiss Lace",
  "Regular Lace",
];

// New in Phase 2A: controlled choices for bundleWeight, whose
// persistence was fixed this phase (see app/csv-product-import.ts
// and ProductBuilder.tsx). Kept here, not inline in ProductBuilder,
// for the same shared-vocabulary reason as the lists above.
export const bundleWeights = [
  "50g",
  "100g",
  "120g",
  "150g",
  "200g+",
];

// pieceCount intentionally has NO fixed choice list. A safety review
// caught that the original "1", "2", "3", "4", "5+" list would have
// collapsed a real 7-piece set into the lossy "5+" bucket -- HairGrab
// already sells 7-piece sets. pieceCount is validated instead as a
// plain positive whole number (see ProductBuilder.tsx's Piece Count
// field, csv-product-import.ts's resolveStructuredPieceCount, and the
// number_integer metafield type in seller.add-product.tsx /
// seller.edit-product.$productId.tsx), so any exact count is stored
// and filterable without an artificial ceiling.
