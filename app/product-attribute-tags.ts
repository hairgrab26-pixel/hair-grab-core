import { CAP_TYPE_VALUES } from "./product-attribute-schema.ts";
import { isLaceSizeChoice, normalizeLaceSize, normalizeLaceType } from "./product-vocabulary.ts";

const CAP_SIZE_VALUES = ["Small", "Medium", "Large", "Adjustable"] as const;

function isCapSizeValue(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return CAP_SIZE_VALUES.some((item) => item.toLowerCase() === normalized);
}

export const SHIPS_WITHIN_VALUES = [
  "Same Day",
  "24 Hours",
  "2-3 Days",
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
  { key: "weftType", label: "Weft Type" },
  { key: "origin", label: "Origin" },
  { key: "color", label: "Color" },
  { key: "shipsWithin", label: "Ships Within" },
  { key: "hairCategory", label: "Hair Category" },
  { key: "hairType", label: "Hair Type" },
  { key: "shippingMethod", label: "Shipping Method" },
  { key: "showOnMap", label: "Show on HairGrab Map" },
  { key: "returnPolicy", label: "Return Policy" },
  { key: "shippingTerritory", label: "Shipping Territory" },
  { key: "shipsFromCity", label: "Ships From City" },
  { key: "shipsFromState", label: "Ships From State" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
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
    ["custom", "hair_type"],
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
  origin: [
    ["custom", "origin"],
    ["hairgrab", "origin"],
  ],
  weftType: [
    ["custom", "weft_type"],
    ["hairgrab", "weft_type"],
  ],
  hairCategory: [
    ["custom", "hair_category"],
    ["hairgrab", "hair_category"],
  ],
  shippingMethod: [
    ["custom", "shipping_method"],
    ["hairgrab", "shipping_charge_type"],
  ],
  showOnMap: [
    ["custom", "show_on_hairgrab_map"],
    ["hairgrab", "show_on_hairgrab_map"],
  ],
  returnPolicy: [
    ["custom", "return_policy"],
    ["hairgrab", "return_policy"],
  ],
  shippingTerritory: [
    ["custom", "shipping_territory"],
    ["hairgrab", "shipping_territory"],
  ],
  shipsFromCity: [
    ["custom", "ships_from_city"],
    ["hairgrab", "ships_from_city"],
  ],
  shipsFromState: [
    ["custom", "ships_from_state"],
    ["hairgrab", "ships_from_state"],
  ],
};

export function parseLaceTypeValues(value: string | string[] | null | undefined) {
  return [...new Set(parseListMetafield(value).map((item) => normalizeLaceType(item)).filter(Boolean))];
}

export function parseNormalizedList(
  value: string | string[] | null | undefined,
  normalize: (item: string) => string,
) {
  return [...new Set(parseListMetafield(value).map((item) => normalize(item)).filter(Boolean))];
}

export function parseDensityValues(value: string | string[] | null | undefined) {
  return parseNormalizedList(value, normalizeDensity);
}

export function parseLaceSizeValues(value: string | string[] | null | undefined) {
  return parseNormalizedList(value, normalizeLaceSize);
}

export function parseCapTypeValues(value: string | string[] | null | undefined) {
  return parseNormalizedList(value, (item) => {
    if (isCapSizeValue(item)) return "";
    const match = CAP_TYPE_VALUES.find((choice) => choice.toLowerCase() === item.trim().toLowerCase());
    return match || completedValue(item);
  });
}

export function parseShipsWithinValues(value: string | string[] | null | undefined) {
  return parseNormalizedList(value, normalizeShipsWithin);
}

export type ProductAttributeTagFields = {
  laceType?: string | string[] | null;
  laceTypes?: string[] | null;
  laceSize?: string | string[] | null;
  laceSizes?: string[] | null;
  capSize?: string | null;
  capType?: string | string[] | null;
  capTypes?: string[] | null;
  density?: string | string[] | null;
  densities?: string[] | null;
  selectedOptions?: string[] | null;
  material?: string | null;
  texture?: string | null;
  colors?: string[] | null;
  shipsWithin?: string | string[] | null;
  shipsWithins?: string[] | null;
  sameDayDelivery?: boolean | null;
  hairCategory?: string | null;
  productType?: string | null;
  lengths?: string[] | null;
  bundleWeight?: string | null;
  extensionType?: string | null;
  styleTypes?: string[] | null;
  origin?: string | null;
  weftType?: string | null;
  shippingMethod?: string | null;
  showOnMap?: string | null;
  returnPolicy?: string | null;
  shippingTerritory?: string | null;
  shipsFromCity?: string | null;
  shipsFromState?: string | null;
};

export type HydratedSellerAttributes = {
  material: string;
  colors: string[];
  texture: string;
  density: string;
  densities: string[];
  laceType: string;
  laceTypes: string[];
  laceSize: string;
  laceSizes: string[];
  capSize: string;
  capType: string;
  capTypes: string[];
  weft: string;
  shipsWithin: string;
  shipsWithins: string[];
  sameDayDelivery: boolean;
  lengths: string[];
  bundleWeight: string;
  extensionType: string;
  styleTypes: string[];
  hairCategory: string;
  origin: string;
  weftType: string;
  shippingMethod: string;
  showOnMap: string;
  returnPolicy: string;
  shippingTerritory: string;
  shipsFromCity: string;
  shipsFromState: string;
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

export function isSameDayShipsWithin(value: string | string[] | null | undefined) {
  return parseShipsWithinValues(value).some((item) => item.toLowerCase() === "same day")
    || String(value || "").trim().toLowerCase() === "same day";
}

export function normalizeShipsWithin(value: string | null | undefined) {
  const trimmed = unwrapMetafieldScalar(value);
  if (!trimmed) return "";
  const match = SHIPS_WITHIN_VALUES.find(
    (choice) => choice.toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) return match;
  if (/3\s*-\s*5/.test(trimmed)) return "3-5 Days";
  if (/2\s*-\s*3/.test(trimmed)) return "2-3 Days";
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

export function parseListMetafield(raw: string | string[] | null | undefined) {
  if (Array.isArray(raw)) {
    return [...new Set(raw.flatMap((item) => parseListMetafield(item)))];
  }
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
    densities: [],
    laceType: "",
    laceTypes: [],
    laceSize: "",
    laceSizes: [],
    capSize: "",
    capType: "",
    capTypes: [],
    weft: "",
    shipsWithin: "",
    shipsWithins: [],
    sameDayDelivery: false,
    lengths: [],
    bundleWeight: "",
    extensionType: "",
    styleTypes: [],
    hairCategory: "",
    origin: "",
    weftType: "",
    shippingMethod: "",
    showOnMap: "",
    returnPolicy: "",
    shippingTerritory: "",
    shipsFromCity: "",
    shipsFromState: "",
  };
}

function assignCapValue(result: HydratedSellerAttributes, value: string) {
  if (isCapSizeValue(value)) result.capSize = value;
  else {
    const capType = parseCapTypeValues(value)[0] || value;
    result.capType = result.capType || capType;
    if (capType && !result.capTypes.includes(capType)) result.capTypes.push(capType);
  }
}

export function attributesFromTags(tags: Iterable<string>) {
  const result = emptyHydratedAttributes();

  for (const raw of tags) {
    const tag = String(raw || "").trim();
    const separator = tag.indexOf(":");
    if (separator <= 0) {
      const capType = parseCapTypeValues(tag)[0];
      if (capType && CAP_TYPE_VALUES.some((item) => item === capType) && !result.capTypes.includes(capType)) {
        result.capTypes.push(capType);
        result.capType = result.capType || capType;
      }
      continue;
    }
    const label = tag.slice(0, separator).trim().toLowerCase();
    const value = tag.slice(separator + 1).trim();
    if (!value) continue;

    if (label === "material" || label === "hair material" || label === "hair type" || label === "material / fiber" || label === "fiber") {
      result.material = value;
    } else if (label === "texture") result.texture = value;
    else if (label === "density") {
      const density = normalizeDensity(value);
      if (density && !result.densities.includes(density)) result.densities.push(density);
      result.density = result.density || density;
    }
    else if (label === "lace type" || label === "lace") {
      const laceType = normalizeLaceType(value);
      if (isLaceSizeChoice(value) && !["HD Lace", "Transparent Lace", "Swiss Lace", "Regular Lace"].includes(laceType)) {
        const laceSize = normalizeLaceSize(value);
        if (laceSize && !result.laceSizes.includes(laceSize)) result.laceSizes.push(laceSize);
        result.laceSize = result.laceSize || laceSize;
      } else if (laceType) {
        if (!result.laceTypes.includes(laceType)) result.laceTypes.push(laceType);
        result.laceType = result.laceType || laceType;
      }
    } else if (label === "lace size") {
      const laceSize = normalizeLaceSize(value);
      if (laceSize && !result.laceSizes.includes(laceSize)) result.laceSizes.push(laceSize);
      result.laceSize = result.laceSize || laceSize;
    }
    else if (label === "cap size") result.capSize = value;
    else if (label === "cap type" || label === "cap") assignCapValue(result, value);
    else if (label === "weft" || label === "weft type") {
      result.weft = value;
      result.weftType = value;
    } else if (label === "origin") result.origin = value;
    else if (label === "shipping method") result.shippingMethod = value;
    else if (label === "show on hairgrab map") result.showOnMap = value;
    else if (label === "return policy") result.returnPolicy = value;
    else if (label === "shipping territory") result.shippingTerritory = value;
    else if (label === "ships from city" || label === "city") result.shipsFromCity = value;
    else if (label === "ships from state" || label === "state") result.shipsFromState = value;
    else if (label === "hair category") result.hairCategory = result.hairCategory || value;
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
      if (shipsWithin && !result.shipsWithins.includes(shipsWithin)) result.shipsWithins.push(shipsWithin);
      if (!isSameDayShipsWithin(shipsWithin) || !result.shipsWithin) {
        result.shipsWithin = result.shipsWithin || shipsWithin;
      }
    }
  }

  return result;
}

function metafieldFallbackList(
  metafields: ProductMetafieldValue[],
  field: keyof typeof METAFIELD_FALLBACKS,
) {
  for (const [namespace, key] of METAFIELD_FALLBACKS[field] || []) {
    const match = metafields.find(
      (item) => item.namespace === namespace && item.key === key && String(item.value || "").trim(),
    );
    if (match) return parseListMetafield(match.value);
  }
  return [] as string[];
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
  const laceTypeValues = parseLaceTypeValues(fields.laceTypes || fields.laceType);
  const laceSizeValues = parseLaceSizeValues(fields.laceSizes?.length ? fields.laceSizes : fields.laceSize);
  const capSize = completedValue(fields.capSize);
  const capTypeValues = parseCapTypeValues(fields.capTypes?.length ? fields.capTypes : fields.capType);
  const densityValues = parseDensityValues(fields.densities?.length ? fields.densities : fields.density);
  const material = completedValue(fields.material);
  const texture = completedValue(fields.texture);
  const weftType = completedValue(fields.weftType) || weftLabel(fields.selectedOptions);
  const origin = completedValue(fields.origin);
  const shipsWithinValues = parseShipsWithinValues(fields.shipsWithins?.length ? fields.shipsWithins : fields.shipsWithin);
  const hairCategory = completedValue(fields.hairCategory);
  const bundleWeight = completedValue(fields.bundleWeight);
  const extensionType = completedValue(fields.extensionType);

  if (material) {
    tags.push(formatAttributeTag("Material", material));
    tags.push(formatAttributeTag("Hair Material", material));
    tags.push(formatAttributeTag("Hair Type", material));
    if (material.toLowerCase() === "human hair") {
      tags.push(formatAttributeTag("Hair Type", "100% Human Hair"));
    }
    if (String(fields.productType || "") === "BRAIDING_HAIR") {
      tags.push(formatAttributeTag("Fiber", material));
    }
  }
  if (texture) tags.push(formatAttributeTag("Texture", texture));
  for (const density of densityValues) tags.push(formatAttributeTag("Density", density));
  for (const laceType of laceTypeValues) tags.push(formatAttributeTag("Lace Type", laceType));
  for (const laceSize of laceSizeValues) tags.push(formatAttributeTag("Lace Size", laceSize));
  if (capSize) {
    tags.push(formatAttributeTag("Cap Size", capSize));
    if (!capTypeValues.length) tags.push(formatAttributeTag("Cap Type", capSize));
  }
  for (const capType of capTypeValues) tags.push(formatAttributeTag("Cap Type", capType));
  if (weftType) {
    tags.push(formatAttributeTag("Weft Type", weftType));
    tags.push(formatAttributeTag("Weft", weftType));
  }
  if (origin) tags.push(formatAttributeTag("Origin", origin));
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
  for (const shipsWithin of shipsWithinValues) tags.push(formatAttributeTag("Ships Within", shipsWithin));
  if (fields.sameDayDelivery && !shipsWithinValues.some((item) => isSameDayShipsWithin(item))) {
    tags.push(formatAttributeTag("Ships Within", "Same Day"));
  }
  if (hairCategory) tags.push(formatAttributeTag("Hair Category", hairCategory));
  const shippingMethod = completedValue(fields.shippingMethod);
  const showOnMap = completedValue(fields.showOnMap);
  const returnPolicy = completedValue(fields.returnPolicy);
  const shippingTerritory = completedValue(fields.shippingTerritory);
  const shipsFromCity = completedValue(fields.shipsFromCity);
  const shipsFromState = completedValue(fields.shipsFromState);
  if (shippingMethod) tags.push(formatAttributeTag("Shipping Method", shippingMethod));
  if (showOnMap) tags.push(formatAttributeTag("Show on HairGrab Map", showOnMap));
  if (returnPolicy) tags.push(formatAttributeTag("Return Policy", returnPolicy));
  if (shippingTerritory) tags.push(formatAttributeTag("Shipping Territory", shippingTerritory));
  if (shipsFromCity) {
    tags.push(formatAttributeTag("Ships From City", shipsFromCity));
    tags.push(formatAttributeTag("City", shipsFromCity));
  }
  if (shipsFromState) {
    tags.push(formatAttributeTag("Ships From State", shipsFromState));
    tags.push(formatAttributeTag("State", shipsFromState));
  }
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
    density?: string | string[];
    laceType?: string | string[];
    laceSize?: string | string[];
    capSize?: string;
    capType?: string | string[];
    shipsWithin?: string | string[];
    sameDayDelivery?: boolean | string;
    bundleWeight?: string;
    extensionType?: string;
    lengths?: string | string[];
    origin?: string;
    weftType?: string;
    hairCategory?: string;
    shippingMethod?: string;
    showOnMap?: string;
    returnPolicy?: string;
    shippingTerritory?: string;
    shipsFromCity?: string;
    shipsFromState?: string;
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

  const shipsWithins = parseShipsWithinValues(
    named.shipsWithin && (Array.isArray(named.shipsWithin) ? named.shipsWithin.length : String(named.shipsWithin).trim())
      ? named.shipsWithin
      : metafieldFallbackList(metafields, "shipsWithin").length
        ? metafieldFallbackList(metafields, "shipsWithin")
        : fromTags.shipsWithins.length
          ? fromTags.shipsWithins
          : fromTags.shipsWithin,
  );
  const shipsWithin = shipsWithins[0] || "";
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
  const laceValues = {
    laceSizes: [] as string[],
    laceTypes: [] as string[],
  };
  const placeLace = (value: string) => {
    const completed = completedValue(value);
    if (!completed) return;
    const laceType = normalizeLaceType(completed);
    if (["HD Lace", "Transparent Lace", "Swiss Lace", "Regular Lace"].includes(laceType)) {
      if (!laceValues.laceTypes.includes(laceType)) laceValues.laceTypes.push(laceType);
      return;
    }
    if (isLaceSizeChoice(completed)) {
      const laceSize = normalizeLaceSize(completed);
      if (laceSize && !laceValues.laceSizes.includes(laceSize)) laceValues.laceSizes.push(laceSize);
      return;
    }
    if (laceType && !laceValues.laceTypes.includes(laceType)) laceValues.laceTypes.push(laceType);
  };
  for (const item of parseLaceTypeValues(named.laceType)) placeLace(item);
  for (const item of parseLaceSizeValues(named.laceSize)) placeLace(item);
  for (const item of parseLaceSizeValues(metafieldFallbackList(metafields, "laceSize"))) placeLace(item);
  for (const item of parseLaceTypeValues(metafieldFallbackList(metafields, "laceType"))) placeLace(item);
  for (const item of fromTags.laceTypes) placeLace(item);
  for (const item of fromTags.laceSizes) placeLace(item);
  if (fromTags.laceSize) placeLace(fromTags.laceSize);
  if (!laceValues.laceTypes.length && fromTags.laceType) placeLace(fromTags.laceType);
  const densities = parseDensityValues(
    named.density && (Array.isArray(named.density) ? named.density.length : String(named.density).trim())
      ? named.density
      : metafieldFallbackList(metafields, "density").length
        ? metafieldFallbackList(metafields, "density")
        : fromTags.densities.length
          ? fromTags.densities
          : fromTags.density,
  );
  const namedCapSize = unwrapMetafieldScalar(named.capSize);
  const capTypes = parseCapTypeValues(
    named.capType && (Array.isArray(named.capType) ? named.capType.length : String(named.capType).trim())
      ? named.capType
      : metafieldFallbackList(metafields, "capType").length
        ? metafieldFallbackList(metafields, "capType")
        : fromTags.capTypes.length
          ? fromTags.capTypes
          : fromTags.capType,
  ).filter((item) => !isCapSizeValue(item));
  const capSize =
    (isCapSizeValue(namedCapSize) ? namedCapSize : "") ||
    metafieldFallback(metafields, "capSize") ||
    fromTags.capSize;

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
    density: densities[0] || "",
    densities,
    laceType: laceValues.laceTypes.join(", "),
    laceTypes: laceValues.laceTypes,
    laceSize: laceValues.laceSizes[0] || "",
    laceSizes: laceValues.laceSizes,
    capSize,
    capType: capTypes[0] || "",
    capTypes,
    weft:
      unwrapMetafieldScalar(named.weftType) ||
      metafieldFallback(metafields, "weftType") ||
      fromTags.weftType ||
      fromTags.weft,
    weftType:
      unwrapMetafieldScalar(named.weftType) ||
      metafieldFallback(metafields, "weftType") ||
      fromTags.weftType ||
      fromTags.weft,
    origin:
      unwrapMetafieldScalar(named.origin) ||
      metafieldFallback(metafields, "origin") ||
      fromTags.origin,
    hairCategory:
      unwrapMetafieldScalar(named.hairCategory) ||
      metafieldFallback(metafields, "hairCategory") ||
      fromTags.hairCategory,
    shippingMethod:
      unwrapMetafieldScalar(named.shippingMethod) ||
      metafieldFallback(metafields, "shippingMethod") ||
      fromTags.shippingMethod,
    showOnMap:
      unwrapMetafieldScalar(named.showOnMap) ||
      metafieldFallback(metafields, "showOnMap") ||
      fromTags.showOnMap,
    returnPolicy:
      unwrapMetafieldScalar(named.returnPolicy) ||
      metafieldFallback(metafields, "returnPolicy") ||
      fromTags.returnPolicy,
    shippingTerritory:
      unwrapMetafieldScalar(named.shippingTerritory) ||
      metafieldFallback(metafields, "shippingTerritory") ||
      fromTags.shippingTerritory,
    shipsFromCity:
      unwrapMetafieldScalar(named.shipsFromCity) ||
      metafieldFallback(metafields, "shipsFromCity") ||
      fromTags.shipsFromCity,
    shipsFromState:
      unwrapMetafieldScalar(named.shipsFromState) ||
      metafieldFallback(metafields, "shipsFromState") ||
      fromTags.shipsFromState,
    shipsWithin,
    shipsWithins,
    sameDayDelivery:
      sameDayFromNamed ||
      sameDayFromMetafield ||
      fromTags.sameDayDelivery ||
      isSameDayShipsWithin(shipsWithins),
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
  if (!value) return [] as string[];
  if (value === "no weft") return ["NO_WEFT"];
  if (value.includes("weft")) return ["WEFT"];
  return [] as string[];
}
