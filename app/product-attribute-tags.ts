const CAP_SIZE_VALUES = ["Small", "Medium", "Large", "Adjustable"] as const;

function isCapSizeValue(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return CAP_SIZE_VALUES.some((item) => item.toLowerCase() === normalized);
}

export const SHIPS_WITHIN_VALUES = [
  "Same Day",
  "24 Hours",
  "48 Hours",
  "72 Hours",
  "3-5 Days",
] as const;

const ATTRIBUTE_TAG_SPECS = [
  { key: "material", label: "Material" },
  { key: "texture", label: "Texture" },
  { key: "density", label: "Density" },
  { key: "laceType", label: "Lace Type" },
  { key: "laceSize", label: "Lace Size" },
  { key: "capSize", label: "Cap Size" },
  { key: "capType", label: "Cap Type" },
  { key: "weft", label: "Weft" },
  { key: "color", label: "Color" },
  { key: "shipsWithin", label: "Ships Within" },
  { key: "hairCategory", label: "Hair Category" },
  { key: "length", label: "Length" },
  { key: "weight", label: "Weight" },
  { key: "bundleWeight", label: "Bundle Weight" },
  { key: "extensionType", label: "Extension Type" },
  { key: "style", label: "Style" },
  { key: "type", label: "Type" },
  { key: "fiber", label: "Fiber" },
] as const;

const LEGACY_TAG_PREFIXES = [
  "lace:",
  "density:",
  "weft:",
  "material:",
  "texture:",
  "color:",
  "cap:",
  "length:",
  "weight:",
] as const;

const METAFIELD_FALLBACKS: Record<string, Array<[string, string]>> = {
  material: [
    ["custom", "material"],
    ["hairgrab", "material"],
  ],
  texture: [
    ["custom", "texture"],
    ["hairgrab", "texture"],
  ],
  density: [
    ["custom", "density"],
    ["hairgrab", "density"],
  ],
  laceType: [
    ["custom", "lace_type"],
    ["hairgrab", "lace_type"],
  ],
  laceSize: [
    ["custom", "lace_size"],
    ["hairgrab", "lace_size"],
  ],
  capSize: [
    ["custom", "cap_size"],
    ["hairgrab", "cap_size"],
  ],
  capType: [
    ["custom", "cap_type"],
    ["hairgrab", "cap_type"],
  ],
  shipsWithin: [
    ["custom", "ships_within"],
    ["hairgrab", "ships_within"],
  ],
  sameDayDelivery: [
    ["custom", "same_day_delivery"],
    ["hairgrab", "same_day_delivery"],
  ],
  bundleWeight: [
    ["custom", "bundle_weight"],
    ["hairgrab", "bundle_weight"],
    ["custom", "weight"],
    ["hairgrab", "weight"],
  ],
  extensionType: [
    ["custom", "extension_type"],
    ["hairgrab", "extension_type"],
  ],
};

export type ProductAttributeTagFields = {
  laceType?: string | null;
  laceSize?: string | null;
  capSize?: string | null;
  capType?: string | null;
  density?: string | null;
  selectedOptions?: string[] | null;
  material?: string | null;
  texture?: string | null;
  colors?: string[] | null;
  shipsWithin?: string | null;
  sameDayDelivery?: boolean | null;
  hairCategory?: string | null;
  productType?: string | null;
  lengths?: string[] | null;
  bundleWeight?: string | null;
  extensionType?: string | null;
  styleTypes?: string[] | null;
};

export type HydratedSellerAttributes = {
  material: string;
  colors: string[];
  texture: string;
  density: string;
  laceType: string;
  laceSize: string;
  capSize: string;
  capType: string;
  weft: string;
  shipsWithin: string;
  sameDayDelivery: boolean;
  lengths: string[];
  bundleWeight: string;
  extensionType: string;
  styleTypes: string[];
};

type ProductMetafieldValue = {
  namespace: string;
  key: string;
  value: string;
};

function completedValue(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed === "Not Applicable") return "";
  return trimmed;
}

export function unwrapMetafieldScalar(raw: string | null | undefined) {
  const items = parseListMetafield(raw);
  return completedValue(items[0] || "");
}

export function normalizeDensity(value: string | null | undefined) {
  const unwrapped = unwrapMetafieldScalar(value);
  if (!unwrapped) return "";
  if (/^\d+(\.\d+)?$/.test(unwrapped)) return `${unwrapped}%`;
  return unwrapped;
}

function weftLabel(options: string[] | null | undefined) {
  const selected = options || [];
  if (selected.includes("WEFT")) return "Weft";
  if (selected.includes("NO_WEFT")) return "No Weft";
  return "";
}

export function isSameDayShipsWithin(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase() === "same day";
}

export function normalizeShipsWithin(value: string | null | undefined) {
  const trimmed = unwrapMetafieldScalar(value);
  if (!trimmed) return "";
  const match = SHIPS_WITHIN_VALUES.find(
    (choice) => choice.toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) return match;
  if (/3\s*-\s*5/.test(trimmed)) return "3-5 Days";
  return trimmed;
}

export function formatAttributeTag(label: string, value: string) {
  return `${label}: ${value}`;
}

function isManagedAttributeTag(tag: string) {
  const trimmed = tag.trim();
  if (LEGACY_TAG_PREFIXES.some((prefix) => trimmed.toLowerCase().startsWith(prefix))) {
    return true;
  }
  return ATTRIBUTE_TAG_SPECS.some((spec) =>
    trimmed.toLowerCase().startsWith(`${spec.label.toLowerCase()}:`),
  ) || trimmed.toLowerCase().startsWith("hair material:")
    || trimmed.toLowerCase().startsWith("material / fiber:");
}

export function parseListMetafield(raw: string | null | undefined) {
  const value = String(raw || "").trim();
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    if (parsed != null && parsed !== "") return [String(parsed).trim()].filter(Boolean);
  } catch {
    // Plain text or comma-separated Shopify values.
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function emptyHydratedAttributes(): HydratedSellerAttributes {
  return {
    material: "",
    colors: [],
    texture: "",
    density: "",
    laceType: "",
    laceSize: "",
    capSize: "",
    capType: "",
    weft: "",
    shipsWithin: "",
    sameDayDelivery: false,
    lengths: [],
    bundleWeight: "",
    extensionType: "",
    styleTypes: [],
  };
}

function assignCapValue(result: HydratedSellerAttributes, value: string) {
  if (isCapSizeValue(value)) result.capSize = value;
  else result.capType = value;
}

export function attributesFromTags(tags: Iterable<string>) {
  const result = emptyHydratedAttributes();

  for (const raw of tags) {
    const tag = String(raw || "").trim();
    const separator = tag.indexOf(":");
    if (separator <= 0) continue;
    const label = tag.slice(0, separator).trim().toLowerCase();
    const value = tag.slice(separator + 1).trim();
    if (!value) continue;

    if (label === "material" || label === "hair material" || label === "hair type" || label === "material / fiber" || label === "fiber") {
      result.material = value;
    } else if (label === "texture") result.texture = value;
    else if (label === "density") result.density = normalizeDensity(value);
    else if (label === "lace type" || label === "lace") {
      if (/^\d/.test(value) || /x/i.test(value) || value.toLowerCase() === "full lace" || value === "360") {
        result.laceSize = result.laceSize || value;
      } else {
        result.laceType = value;
      }
    }     else if (label === "lace size") result.laceSize = value;
    else if (label === "cap size") result.capSize = value;
    else if (label === "cap type" || label === "cap") assignCapValue(result, value);
    else if (label === "weft") result.weft = value;
    else if (label === "color") result.colors.push(value);
    else if (label === "length") {
      const length = value.replace(/\s*inch(?:es)?$/i, "").trim();
      if (length) result.lengths.push(length);
    } else if (label === "weight" || label === "bundle weight") result.bundleWeight = value;
    else if (label === "extension type") result.extensionType = value;
    else if (label === "style" || label === "type") {
      if (!result.styleTypes.includes(value)) result.styleTypes.push(value);
    } else if (label === "ships within") {
      const shipsWithin = normalizeShipsWithin(value);
      if (isSameDayShipsWithin(shipsWithin)) result.sameDayDelivery = true;
      if (!isSameDayShipsWithin(shipsWithin) || !result.shipsWithin) {
        result.shipsWithin = shipsWithin;
      }
    }
  }

  return result;
}

function metafieldFallback(
  metafields: ProductMetafieldValue[],
  field: keyof typeof METAFIELD_FALLBACKS,
) {
  for (const [namespace, key] of METAFIELD_FALLBACKS[field] || []) {
    const match = metafields.find(
      (item) => item.namespace === namespace && item.key === key && String(item.value || "").trim(),
    );
    if (match) return unwrapMetafieldScalar(match.value);
  }
  return "";
}

function extensionTypeAliases(label: string) {
  const tags = [formatAttributeTag("Extension Type", label)];
  const lower = label.toLowerCase();
  if (lower.includes("clip")) {
    tags.push(formatAttributeTag("Extension Type", "Clip-In"));
    tags.push(formatAttributeTag("Extension Type", "Clip-Ins"));
  }
  if (lower.includes("tape")) {
    tags.push(formatAttributeTag("Extension Type", "Tape-In"));
    tags.push(formatAttributeTag("Extension Type", "Tape-Ins"));
  }
  if (lower.includes("i-tip") || lower.includes("microlink")) {
    tags.push(formatAttributeTag("Extension Type", "I-Tip"));
    tags.push(formatAttributeTag("Extension Type", "Microlink"));
  }
  return [...new Set(tags)];
}

export function productAttributeTags(fields: ProductAttributeTagFields) {
  const tags: string[] = [];
  const laceType = completedValue(fields.laceType);
  const laceSize = completedValue(fields.laceSize);
  const capSize = completedValue(fields.capSize);
  const capType = completedValue(fields.capType);
  const density = normalizeDensity(fields.density);
  const material = completedValue(fields.material);
  const texture = completedValue(fields.texture);
  const weft = weftLabel(fields.selectedOptions);
  const shipsWithin = normalizeShipsWithin(fields.shipsWithin);
  const hairCategory = completedValue(fields.hairCategory);
  const bundleWeight = completedValue(fields.bundleWeight);
  const extensionType = completedValue(fields.extensionType);

  if (material) {
    tags.push(formatAttributeTag("Material", material));
    tags.push(formatAttributeTag("Hair Material", material));
    if (String(fields.productType || "") === "BRAIDING_HAIR") {
      tags.push(formatAttributeTag("Fiber", material));
    }
  }
  if (texture) tags.push(formatAttributeTag("Texture", texture));
  if (density) tags.push(formatAttributeTag("Density", density));
  if (laceType) tags.push(formatAttributeTag("Lace Type", laceType));
  if (laceSize) tags.push(formatAttributeTag("Lace Size", laceSize));
  if (capSize) {
    tags.push(formatAttributeTag("Cap Size", capSize));
    if (!capType) tags.push(formatAttributeTag("Cap Type", capSize));
  }
  if (capType) tags.push(formatAttributeTag("Cap Type", capType));
  if (weft) tags.push(formatAttributeTag("Weft", weft));
  for (const color of fields.colors || []) {
    const completed = completedValue(color);
    if (completed) tags.push(formatAttributeTag("Color", completed));
  }
  for (const length of [...new Set(fields.lengths || [])]) {
    const completed = completedValue(length);
    if (!completed) continue;
    tags.push(formatAttributeTag("Length", completed));
    if (/^\d+$/.test(completed)) tags.push(formatAttributeTag("Length", `${completed} Inch`));
  }
  if (bundleWeight) {
    tags.push(formatAttributeTag("Weight", bundleWeight));
    tags.push(formatAttributeTag("Bundle Weight", bundleWeight));
  }
  if (extensionType) tags.push(...extensionTypeAliases(extensionType));
  for (const style of [...new Set(fields.styleTypes || [])]) {
    const completed = completedValue(style);
    if (!completed) continue;
    tags.push(formatAttributeTag("Style", completed));
    tags.push(formatAttributeTag("Type", completed));
  }
  if (shipsWithin) tags.push(formatAttributeTag("Ships Within", shipsWithin));
  if (fields.sameDayDelivery && !isSameDayShipsWithin(shipsWithin)) {
    tags.push(formatAttributeTag("Ships Within", "Same Day"));
  }
  if (hairCategory) tags.push(formatAttributeTag("Hair Category", hairCategory));
  return tags;
}

export function replaceAttributeTags(existing: Iterable<string>, next: string[]) {
  const tags = new Set(existing);
  for (const tag of [...tags]) {
    if (isManagedAttributeTag(tag)) tags.delete(tag);
  }
  for (const tag of next) tags.add(tag);
  return [...tags];
}

export function hydrateSellerAttributes({
  tags = [],
  metafields = [],
  named = {},
}: {
  tags?: Iterable<string>;
  metafields?: ProductMetafieldValue[];
  named?: {
    material?: string;
    colors?: string | string[];
    texture?: string;
    density?: string;
    laceType?: string;
    laceSize?: string;
    capSize?: string;
    capType?: string;
    shipsWithin?: string;
    sameDayDelivery?: boolean | string;
    bundleWeight?: string;
    extensionType?: string;
    lengths?: string | string[];
  };
}) {
  const fromTags = attributesFromTags(tags);
  const namedColors = Array.isArray(named.colors)
    ? named.colors
    : parseListMetafield(named.colors);
  const colorMetafield = namedColors.length
    ? namedColors
    : parseListMetafield(
        metafields.find((item) =>
          ["color", "colors"].includes(item.key) && String(item.value || "").trim(),
        )?.value,
      );

  const shipsWithin = normalizeShipsWithin(
    named.shipsWithin ||
      metafieldFallback(metafields, "shipsWithin") ||
      fromTags.shipsWithin,
  );
  const sameDayRaw = named.sameDayDelivery;
  const sameDayFromNamed =
    sameDayRaw === true ||
    String(sameDayRaw || "").toLowerCase() === "true";
  const sameDayFromMetafield =
    metafieldFallback(metafields, "sameDayDelivery").toLowerCase() === "true";

  const colors = (namedColors.length ? namedColors : colorMetafield.length ? colorMetafield : fromTags.colors)
    .map((item) => String(item).trim())
    .filter(Boolean);

  const namedLengths = Array.isArray(named.lengths) ? named.lengths : parseListMetafield(named.lengths);
  const namedCapSize = unwrapMetafieldScalar(named.capSize);
  const namedCapType = unwrapMetafieldScalar(named.capType);
  const capSize =
    (isCapSizeValue(namedCapSize) ? namedCapSize : "") ||
    (isCapSizeValue(namedCapType) ? namedCapType : "") ||
    metafieldFallback(metafields, "capSize") ||
    fromTags.capSize;
  const capType =
    (!isCapSizeValue(namedCapType) ? namedCapType : "") ||
    metafieldFallback(metafields, "capType") ||
    fromTags.capType;

  return {
    material:
      unwrapMetafieldScalar(named.material) ||
      metafieldFallback(metafields, "material") ||
      fromTags.material,
    colors: [...new Set(colors)],
    texture:
      unwrapMetafieldScalar(named.texture) ||
      metafieldFallback(metafields, "texture") ||
      fromTags.texture,
    density:
      normalizeDensity(named.density) ||
      normalizeDensity(metafieldFallback(metafields, "density")) ||
      fromTags.density,
    laceType:
      unwrapMetafieldScalar(named.laceType) ||
      metafieldFallback(metafields, "laceType") ||
      fromTags.laceType,
    laceSize:
      unwrapMetafieldScalar(named.laceSize) ||
      metafieldFallback(metafields, "laceSize") ||
      fromTags.laceSize,
    capSize,
    capType: isCapSizeValue(capType) ? "" : capType,
    weft: fromTags.weft,
    shipsWithin,
    sameDayDelivery:
      sameDayFromNamed ||
      sameDayFromMetafield ||
      fromTags.sameDayDelivery ||
      isSameDayShipsWithin(shipsWithin),
    lengths: [...new Set((namedLengths.length ? namedLengths : fromTags.lengths).map((item) => String(item).trim()).filter(Boolean))],
    bundleWeight:
      unwrapMetafieldScalar(named.bundleWeight) ||
      metafieldFallback(metafields, "bundleWeight") ||
      fromTags.bundleWeight,
    extensionType:
      unwrapMetafieldScalar(named.extensionType) ||
      metafieldFallback(metafields, "extensionType") ||
      fromTags.extensionType,
    styleTypes: fromTags.styleTypes,
  } satisfies HydratedSellerAttributes;
}

export function weftOptionValues(weft: string | null | undefined) {
  const value = String(weft || "").trim().toLowerCase();
  if (value === "weft") return ["WEFT"];
  if (value === "no weft") return ["NO_WEFT"];
  return [] as string[];
}
