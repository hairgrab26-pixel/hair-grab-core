import { ADMIN_PRODUCT_METAFIELDS } from "./admin-product-metafields.ts";

export type AttributeSource = {
  namespace?: string;
  key: string;
  value?: string | null;
};

function unwrap(raw: string | null | undefined) {
  const value = String(raw || "").trim();
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item).trim()).filter(Boolean);
    if (parsed != null && parsed !== "") return [String(parsed).trim()].filter(Boolean);
  } catch {
    // plain text
  }
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function first(raw: string | null | undefined) {
  return unwrap(raw)[0] || "";
}

function metafieldValue(metafields: AttributeSource[], keys: string[]) {
  const wanted = keys.map((key) => key.toLowerCase().replace(/[\s-]+/g, "_"));
  for (const item of metafields) {
    const key = String(item.key || "").toLowerCase().replace(/[\s-]+/g, "_");
    if (wanted.includes(key) && String(item.value || "").trim()) return String(item.value);
  }
  return "";
}

function attributesFromTags(tags: Iterable<string>) {
  const result: Record<string, string | string[]> = {};
  for (const raw of tags) {
    const tag = String(raw || "").trim();
    const separator = tag.indexOf(":");
    if (separator <= 0) continue;
    const label = tag.slice(0, separator).trim().toLowerCase();
    const value = tag.slice(separator + 1).trim();
    if (!value) continue;
    const spec = ADMIN_PRODUCT_METAFIELDS.find((item) =>
      item.tagLabels.some((tagLabel) => tagLabel.toLowerCase() === label),
    );
    if (!spec) continue;
    if (spec.list) {
      const current = Array.isArray(result[spec.formKey]) ? [...(result[spec.formKey] as string[])] : [];
      const length = label === "length" ? value.replace(/\s*inch(?:es)?$/i, "").trim() : value;
      if (length && !current.includes(length)) current.push(length);
      result[spec.formKey] = current;
    } else if (!result[spec.formKey]) {
      result[spec.formKey] = value;
    }
  }
  return result;
}

/** Parse the 16 Admin product metafields (plus tags) for seller rehydration and discovery. */
export function parseAdminProductAttributes({
  metafields = [],
  tags = [],
}: {
  metafields?: AttributeSource[];
  tags?: Iterable<string>;
}) {
  const fromTags = attributesFromTags(tags);
  const parsed: Record<string, string | string[]> = {};

  for (const spec of ADMIN_PRODUCT_METAFIELDS) {
    const raw = metafieldValue(metafields, [spec.key, ...spec.names.map((name) => name.toLowerCase())]);
    if (spec.list) {
      const values = unwrap(raw);
      parsed[spec.formKey] = values.length ? values : (fromTags[spec.formKey] as string[]) || [];
    } else {
      parsed[spec.formKey] = first(raw) || String(fromTags[spec.formKey] || "");
    }
  }

  if (!parsed.material) {
    parsed.material = first(metafieldValue(metafields, ["hair_type", "material", "hair type"])) || String(fromTags.material || "");
  }
  if (!parsed.shipsWithin) {
    parsed.shipsWithin = first(metafieldValue(metafields, ["ships_within", "ships within"])) || String(fromTags.shipsWithin || "");
  }

  return parsed;
}

export const DISCOVERY_FILTER_KEYS = [
  "texture",
  "hairType",
  "density",
  "capType",
  "origin",
  "weftType",
  "shipsWithin",
  "city",
  "state",
  "length",
  "color",
] as const;
