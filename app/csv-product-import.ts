// ==========================================================
// HAIRGRAB CSV PRODUCT IMPORT — STRUCTURED-COLUMN RESOLUTION
//
// Added in Phase 2A to fix a confirmed structured-data defect:
// the seller catalog CSV importer (app/components/ProductBuilder.tsx)
// used to derive productType/texture/material/laceSize purely by
// regex-matching the product TITLE (see inferProductDetailsFromTitle
// below, which is the same logic that used to live inline there,
// unchanged). A wrong-but-non-empty guess from that inference could
// pass straight through to Shopify with no further review.
//
// This module is intentionally plain TypeScript with no React/JSX
// and no server-only imports, so it can be unit tested directly and
// shared between the CSV importer UI and those tests without
// pulling in ProductBuilder.tsx's ~5,700 lines of component code.
//
// The precedence rule implemented here is:
//   1. An explicit, valid structured CSV column always wins.
//   2. An explicit structured CSV column with an UNRECOGNIZED value
//      is treated as a row error, not silently discarded and not
//      silently replaced by a title guess -- the seller's own data
//      said something specific; guessing over it would be worse.
//   3. Only when no structured column exists at all does title
//      inference run, and its result is always marked
//      `needsConfirmation: true`. Nothing marked needsConfirmation
//      may be treated as "ready to import" by the caller -- see
//      ProductBuilder.tsx's csvItemReady(), which now checks this.
// ==========================================================

// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { CANONICAL_PRODUCT_CATEGORIES, normalizeProductCategory, PRODUCT_CATEGORY_LABELS, type ProductType } from "./product-categories.ts";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { laceSizes, materials, textures } from "./product-vocabulary.ts";

export type CsvFieldName = "productType" | "productOption" | "texture" | "material" | "laceSize" | "pieceCount";

export type CsvFieldSource = "structured" | "inferred" | "missing" | "invalid";

export type CsvFieldResolution = {
  value: string;
  source: CsvFieldSource;
  /** Present only when source is "invalid" -- what the CSV actually said. */
  rawValue?: string;
};

// Column headers (already lowercased/alphanumeric-only via
// normalizeCsvHeader) that count as an explicit structured value for
// each field. Kept narrow and literal on purpose -- these are the
// column names a seller's own export or a HairGrab-provided template
// would realistically use, not a guess-everything fuzzy matcher.
export const STRUCTURED_COLUMN_ALIASES: Record<CsvFieldName, string[]> = {
  productType: ["category", "producttype", "hairgrabcategory", "productcategory"],
  productOption: ["productoption", "subtype", "producttypesubtype", "style"],
  texture: ["texture"],
  material: ["material", "hairtype"],
  laceSize: ["lacesize"],
  pieceCount: ["piececount", "pieces", "numberofpieces"],
};

const PRODUCT_TYPE_BY_NORMALIZED_LABEL: Record<string, ProductType> = Object.fromEntries(
  (Object.keys(PRODUCT_CATEGORY_LABELS) as ProductType[]).map((key) => [
    PRODUCT_CATEGORY_LABELS[key].toLowerCase().replace(/[^a-z0-9]+/g, ""),
    key,
  ]),
);

export function normalizeCsvHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Same quoted-CSV-with-embedded-commas/newlines parser that used to
 * live inline in ProductBuilder.tsx's handleCsvFile. Unchanged logic,
 * moved here so it's covered by tests independent of the React form.
 */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];

    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(cell.trim());
      cell = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((value) => value.length > 0)) rows.push(row);
  }

  return rows;
}

/**
 * Resolves a raw CSV category/subtype value against the canonical
 * ProductType enum. Accepts the same drift normalizeProductCategory
 * already tolerates (label text, legacy labels, "WIG" enum text).
 */
export function resolveStructuredProductType(raw: string): ProductType | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (Object.prototype.hasOwnProperty.call(PRODUCT_CATEGORY_LABELS, value.toUpperCase())) {
    return value.toUpperCase() as ProductType;
  }
  const canonicalLabel = normalizeProductCategory(value);
  if (!canonicalLabel) return null;
  const normalized = canonicalLabel.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return PRODUCT_TYPE_BY_NORMALIZED_LABEL[normalized] || null;
}

function resolveAgainstList(raw: string, allowed: string[]): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const match = allowed.find((choice) => choice.toLowerCase().replace(/[^a-z0-9]+/g, "") === normalized);
  return match || null;
}

export function resolveStructuredTexture(raw: string): string | null {
  return resolveAgainstList(raw, textures);
}

export function resolveStructuredMaterial(raw: string): string | null {
  return resolveAgainstList(raw, materials);
}

export function resolveStructuredLaceSize(raw: string): string | null {
  return resolveAgainstList(raw, laceSizes);
}

/**
 * Safety-review fix: pieceCount has no fixed choice list (a "1".."5+"
 * dropdown would collapse a real 7-piece set into a lossy bucket --
 * HairGrab already sells 7-piece sets), so it is validated as a plain
 * exact positive whole number instead of matched against a list.
 */
export function resolveStructuredPieceCount(raw: string): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  return /^[1-9][0-9]*$/.test(value) ? value : null;
}

export function resolveStructuredProductOption(raw: string, options: Array<{ value: string; label: string }>): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const match = options.find((choice) =>
    choice.value.toLowerCase().replace(/[^a-z0-9]+/g, "") === normalized ||
    choice.label.toLowerCase().replace(/[^a-z0-9]+/g, "") === normalized,
  );
  return match?.value || null;
}

/**
 * Non-authoritative fallback ONLY. Same regex-based guesses the
 * inline inferHairGrabDetails used to make from the product title.
 * Every result from this function must be surfaced to the seller as
 * needing confirmation before an import proceeds -- see
 * resolveCsvProductFields below and ProductBuilder.tsx's
 * csvItemReady().
 */
export function inferProductDetailsFromTitle(title: string): {
  productType?: ProductType;
  productOption?: string;
  texture?: string;
  material?: string;
  laceSize?: string;
} {
  const text = title.toLowerCase();
  let productType: ProductType | undefined;
  let productOption: string | undefined;
  let texture: string | undefined;
  let material: string | undefined;
  let laceSize: string | undefined;

  if (/wig/.test(text)) productType = "WIG";
  else if (/closure|frontal/.test(text)) productType = "CLOSURE_FRONTAL";
  else if (/bundle|weft/.test(text)) productType = "BUNDLE";
  else if (/clip[ -]?in|tape[ -]?in|i[ -]?tip|micro.?link|ponytail|halo|topper|sew[ -]?in/.test(text)) productType = "EXTENSION";
  else if (/braid|loc|marley|boho|crochet/.test(text)) productType = "BRAIDING_HAIR";

  if (/human hair|virgin|raw hair|remy/.test(text)) material = "Human Hair";
  if (/synthetic/.test(text)) material = "Synthetic Hair";

  if (/body wave/.test(text)) texture = "Body Wave";
  else if (/loose wave/.test(text)) texture = "Loose Wave";
  else if (/deep wave/.test(text)) texture = "Deep Wave";
  else if (/water wave/.test(text)) texture = "Water Wave";
  else if (/deep curl/.test(text)) texture = "Deep Curly";
  else if (/kinky curl/.test(text)) texture = "Kinky Curly";
  else if (/kinky straight/.test(text)) texture = "Kinky Straight";
  else if (/curly|curl/.test(text)) texture = "Curly";
  else if (/straight/.test(text)) texture = "Straight";

  if (productType === "WIG") {
    if (/glueless/.test(text)) productOption = "GLUELESS";
    else if (/closure/.test(text)) productOption = "CLOSURE_WIG";
    else if (/frontal/.test(text)) productOption = "FRONTAL_WIG";
    else if (/full lace/.test(text)) productOption = "FULL_LACE";
    else if (/headband/.test(text)) productOption = "HEADBAND";
  } else if (productType === "CLOSURE_FRONTAL") {
    if (/360/.test(text)) productOption = "360_FRONTAL";
    else if (/frontal/.test(text)) productOption = "FRONTAL";
    else if (/closure/.test(text)) productOption = "CLOSURE";
  } else if (productType === "EXTENSION") {
    if (/clip[ -]?in/.test(text)) productOption = "CLIP_IN";
    else if (/tape[ -]?in/.test(text)) productOption = "TAPE_IN";
    else if (/i[ -]?tip|micro.?link/.test(text)) productOption = "I_TIP";
    else if (/ponytail/.test(text)) productOption = "PONYTAIL";
    else if (/halo/.test(text)) productOption = "HALO";
    else if (/topper/.test(text)) productOption = "TOPPER";
    else if (/sew[ -]?in/.test(text)) productOption = "SEW_IN";
  }

  for (const size of laceSizes) {
    if (text.includes(size.toLowerCase())) { laceSize = size; break; }
  }

  return { productType, productOption, texture, material, laceSize };
}

export type CsvRowStructuredColumns = Partial<Record<CsvFieldName, string>>;

export type CsvResolvedFields = {
  productType: CsvFieldResolution;
  texture: CsvFieldResolution;
  material: CsvFieldResolution;
  laceSize: CsvFieldResolution;
  pieceCount: CsvFieldResolution;
  /** Field names whose current value came from title inference and has not yet been confirmed by the seller. */
  needsConfirmation: CsvFieldName[];
  /** Human-readable, row-specific messages for any structured column whose value did not validate. */
  errors: string[];
};

/**
 * The single entry point the CSV importer UI should call per parsed
 * product row/group. Structured columns (when present) are validated
 * and always take precedence; title inference only fills gaps, and
 * anything it fills is flagged in `needsConfirmation`.
 */
export function resolveCsvProductFields(
  title: string,
  structured: CsvRowStructuredColumns,
): CsvResolvedFields {
  const inferred = inferProductDetailsFromTitle(title);
  const needsConfirmation: CsvFieldName[] = [];
  const errors: string[] = [];

  function resolveOne(
    field: CsvFieldName,
    resolver: (raw: string) => string | null,
    inferredValue: string | undefined,
  ): CsvFieldResolution {
    const raw = structured[field];
    if (raw && raw.trim()) {
      const resolved = resolver(raw);
      if (resolved) return { value: resolved, source: "structured" };
      errors.push(`"${raw.trim()}" in the ${field} column is not a recognized value and was not imported.`);
      return { value: "", source: "invalid", rawValue: raw.trim() };
    }
    if (inferredValue) {
      needsConfirmation.push(field);
      return { value: inferredValue, source: "inferred" };
    }
    return { value: "", source: "missing" };
  }

  const productTypeResolution = ((): CsvFieldResolution => {
    const raw = structured.productType;
    if (raw && raw.trim()) {
      const resolved = resolveStructuredProductType(raw);
      if (resolved) return { value: resolved, source: "structured" };
      errors.push(`"${raw.trim()}" in the category column is not a recognized HairGrab category and was not imported.`);
      return { value: "", source: "invalid", rawValue: raw.trim() };
    }
    if (inferred.productType) {
      needsConfirmation.push("productType");
      return { value: inferred.productType, source: "inferred" };
    }
    return { value: "", source: "missing" };
  })();

  return {
    productType: productTypeResolution,
    texture: resolveOne("texture", (raw) => resolveStructuredTexture(raw), inferred.texture),
    material: resolveOne("material", (raw) => resolveStructuredMaterial(raw), inferred.material),
    laceSize: resolveOne("laceSize", (raw) => resolveStructuredLaceSize(raw), inferred.laceSize),
    // No title-inference signal exists for piece count -- it is only
    // ever structured or missing, never guessed.
    pieceCount: resolveOne("pieceCount", (raw) => resolveStructuredPieceCount(raw), undefined),
    needsConfirmation,
    errors,
  };
}

export { CANONICAL_PRODUCT_CATEGORIES };
