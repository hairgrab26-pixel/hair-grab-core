export const SHIPS_WITHIN_VALUES = ["24 Hours", "48 Hours", "72 Hours"] as const;

const ATTRIBUTE_TAG_PREFIXES = [
  "lace:",
  "density:",
  "weft:",
  "material:",
  "texture:",
  "color:",
] as const;

export type ProductAttributeTagFields = {
  laceType?: string | null;
  density?: string | null;
  selectedOptions?: string[] | null;
  material?: string | null;
  texture?: string | null;
  colors?: string[] | null;
};

function completedValue(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed === "Not Applicable") return "";
  return trimmed;
}

export function productAttributeTags(fields: ProductAttributeTagFields) {
  const tags: string[] = [];
  const laceType = completedValue(fields.laceType);
  const density = completedValue(fields.density);
  const material = completedValue(fields.material);
  const texture = completedValue(fields.texture);
  const options = fields.selectedOptions || [];

  if (laceType) tags.push(`lace:${laceType}`);
  if (density) tags.push(`density:${density}`);
  if (options.includes("WEFT")) tags.push("weft:Weft");
  if (options.includes("NO_WEFT")) tags.push("weft:No Weft");
  if (material) tags.push(`material:${material}`);
  if (texture) tags.push(`texture:${texture}`);
  for (const color of fields.colors || []) {
    const completed = completedValue(color);
    if (completed) tags.push(`color:${completed}`);
  }
  return tags;
}

export function replaceAttributeTags(existing: Iterable<string>, next: string[]) {
  const tags = new Set(existing);
  for (const tag of [...tags]) {
    if (ATTRIBUTE_TAG_PREFIXES.some((prefix) => tag.startsWith(prefix))) {
      tags.delete(tag);
    }
  }
  for (const tag of next) tags.add(tag);
  return [...tags];
}

export function isSameDayShipsWithin(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase() === "same day";
}

export function normalizeShipsWithin(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  if ((SHIPS_WITHIN_VALUES as readonly string[]).includes(trimmed)) return trimmed;
  if (isSameDayShipsWithin(trimmed)) return "24 Hours";
  return trimmed || "48 Hours";
}
