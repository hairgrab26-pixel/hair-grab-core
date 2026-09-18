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
  { key: "weft", label: "Weft" },
  { key: "color", label: "Color" },
  { key: "shipsWithin", label: "Ships Within" },
  { key: "hairCategory", label: "Hair Category" },
] as const;

const LEGACY_TAG_PREFIXES = [
  "lace:",
  "density:",
  "weft:",
  "material:",
  "texture:",
  "color:",
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
  shipsWithin: [
    ["custom", "ships_within"],
    ["hairgrab", "ships_within"],
  ],
  sameDayDelivery: [
    ["custom", "same_day_delivery"],
    ["hairgrab", "same_day_delivery"],
  ],
};

export type ProductAttributeTagFields = {
  laceType?: string | null;
  laceSize?: string | null;
  density?: string | null;
  selectedOptions?: string[] | null;
  material?: string | null;
  texture?: string | null;
  colors?: string[] | null;
  shipsWithin?: string | null;
  sameDayDelivery?: boolean | null;
  hairCategory?: string | null;
};

export type HydratedSellerAttributes = {
  material: string;
  colors: string[];
  texture: string;
  density: string;
  laceType: string;
  laceSize: string;
  weft: string;
  shipsWithin: string;
  sameDayDelivery: boolean;
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
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const match = SHIPS_WITHIN_VALUES.find(
    (choice) => choice.toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) return match;
  if (trimmed === "72 Hours" || /3\s*-\s*5/.test(trimmed)) return "3-5 Days";
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
  );
}

export function parseListMetafield(raw: string | null | undefined) {
  const value = String(raw || "").trim();
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    // Plain text or comma-separated Shopify values.
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export function attributesFromTags(tags: Iterable<string>) {
  const result: HydratedSellerAttributes = {
    material: "",
    colors: [],
    texture: "",
    density: "",
    laceType: "",
    laceSize: "",
    weft: "",
    shipsWithin: "",
    sameDayDelivery: false,
  };

  for (const raw of tags) {
    const tag = String(raw || "").trim();
    const separator = tag.indexOf(":");
    if (separator <= 0) continue;
    const label = tag.slice(0, separator).trim().toLowerCase();
    const value = tag.slice(separator + 1).trim();
    if (!value) continue;

    if (label === "material") result.material = value;
    else if (label === "texture") result.texture = value;
    else if (label === "density") result.density = value;
    else if (label === "lace type" || label === "lace") {
      if (/^\d/.test(value) || /x/i.test(value) || value.toLowerCase() === "full lace" || value === "360") {
        result.laceSize = result.laceSize || value;
      } else {
        result.laceType = value;
      }
    } else if (label === "lace size") result.laceSize = value;
    else if (label === "weft") result.weft = value;
    else if (label === "color") result.colors.push(value);
    else if (label === "ships within") {
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
    if (match) return String(match.value).trim();
  }
  return "";
}

export function productAttributeTags(fields: ProductAttributeTagFields) {
  const tags: string[] = [];
  const laceType = completedValue(fields.laceType);
  const laceSize = completedValue(fields.laceSize);
  const density = completedValue(fields.density);
  const material = completedValue(fields.material);
  const texture = completedValue(fields.texture);
  const weft = weftLabel(fields.selectedOptions);
  const shipsWithin = normalizeShipsWithin(fields.shipsWithin);
  const hairCategory = completedValue(fields.hairCategory);

  if (material) tags.push(formatAttributeTag("Material", material));
  if (texture) tags.push(formatAttributeTag("Texture", texture));
  if (density) tags.push(formatAttributeTag("Density", density));
  if (laceType) tags.push(formatAttributeTag("Lace Type", laceType));
  if (laceSize) tags.push(formatAttributeTag("Lace Size", laceSize));
  if (weft) tags.push(formatAttributeTag("Weft", weft));
  for (const color of fields.colors || []) {
    const completed = completedValue(color);
    if (completed) tags.push(formatAttributeTag("Color", completed));
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
    shipsWithin?: string;
    sameDayDelivery?: boolean | string;
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

  return {
    material:
      completedValue(named.material) ||
      metafieldFallback(metafields, "material") ||
      fromTags.material,
    colors: [...new Set(colors)],
    texture:
      completedValue(named.texture) ||
      metafieldFallback(metafields, "texture") ||
      fromTags.texture,
    density:
      completedValue(named.density) ||
      metafieldFallback(metafields, "density") ||
      fromTags.density,
    laceType:
      completedValue(named.laceType) ||
      metafieldFallback(metafields, "laceType") ||
      fromTags.laceType,
    laceSize:
      completedValue(named.laceSize) ||
      metafieldFallback(metafields, "laceSize") ||
      fromTags.laceSize,
    weft: fromTags.weft,
    shipsWithin,
    sameDayDelivery:
      sameDayFromNamed ||
      sameDayFromMetafield ||
      fromTags.sameDayDelivery ||
      isSameDayShipsWithin(shipsWithin),
  } satisfies HydratedSellerAttributes;
}

export function weftOptionValues(weft: string | null | undefined) {
  const value = String(weft || "").trim().toLowerCase();
  if (value === "weft") return ["WEFT"];
  if (value === "no weft") return ["NO_WEFT"];
  return [] as string[];
}
