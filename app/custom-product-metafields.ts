// @ts-ignore Node's TypeScript stripping requires the explicit extension.
import {
  parseCapTypeValues,
  parseDensityValues,
  parseLaceSizeValues,
  parseLaceTypeValues,
  parseListMetafield,
  storefrontShipsWithinValues,
} from "./product-attribute-tags.ts";

export type CustomListMetafield = {
  namespace: "custom";
  key: "ships_within" | "lace_type" | "cap_type" | "density" | "lace_size";
  type: "list.single_line_text_field";
  value: string;
};

/** Shopify list metafields must be a JSON array of strings, e.g. `["Same Day Delivery"]`. */
export function serializeCustomListMetafieldValue(values: string | string[] | null | undefined) {
  const items = (Array.isArray(values) ? values : parseListMetafield(values))
    .map((item) => String(item).trim())
    .filter(Boolean);
  return JSON.stringify([...new Set(items)]);
}

export function customSearchDiscoveryMetafields(input: {
  shipsWithin?: string | string[] | null;
  sameDayDelivery?: boolean | null;
  laceType?: string | string[] | null;
  capType?: string | string[] | null;
  density?: string | string[] | null;
  laceSize?: string | string[] | null;
}): CustomListMetafield[] {
  const shipsWithin = storefrontShipsWithinValues(
    input.shipsWithin || (input.sameDayDelivery ? "Same Day" : ""),
  );
  const fields: Array<[CustomListMetafield["key"], string[]]> = [
    ["ships_within", shipsWithin],
    ["lace_type", parseLaceTypeValues(input.laceType)],
    ["cap_type", parseCapTypeValues(input.capType)],
    ["density", parseDensityValues(input.density)],
    ["lace_size", parseLaceSizeValues(input.laceSize)],
  ];
  return fields
    .filter(([, values]) => values.length > 0)
    .map(([key, values]) => ({
      namespace: "custom",
      key,
      type: "list.single_line_text_field",
      value: serializeCustomListMetafieldValue(values),
    }));
}

export function upsertCustomSearchDiscoveryMetafields<T extends { namespace: string; key: string; type: string; value: string }>(
  output: T[],
  input: Parameters<typeof customSearchDiscoveryMetafields>[0],
) {
  for (const field of customSearchDiscoveryMetafields(input)) {
    const existing = output.find((item) => item.namespace === field.namespace && item.key === field.key);
    if (existing) {
      existing.type = field.type;
      existing.value = field.value;
    } else {
      output.push(field as T);
    }
  }
  return output;
}
