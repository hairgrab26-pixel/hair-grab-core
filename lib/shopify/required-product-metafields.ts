/** Merchant-owned PRODUCT metafields HairGrab requires under custom.* (not category metafields). */
export const REQUIRED_CUSTOM_PRODUCT_METAFIELDS = [
  {
    name: "Origin",
    key: "origin",
    type: "single_line_text_field",
    description: "Hair origin used by HairGrab seller forms and storefront filters.",
  },
  {
    name: "Lace Size",
    key: "lace_size",
    type: "list.single_line_text_field",
    description: "Lace sizes such as 13x4. Supports multiple values.",
  },
  {
    name: "Lace Type",
    key: "lace_type",
    type: "list.single_line_text_field",
    description: "Lace construction such as HD Lace. Supports multiple values.",
  },
  {
    name: "Density",
    key: "density",
    type: "list.single_line_text_field",
    description: "Hair density such as 180%. Supports multiple values.",
  },
  {
    name: "Cap Type",
    key: "cap_type",
    type: "list.single_line_text_field",
    description: "Cap construction such as Glueless or Full Lace. Supports multiple values.",
  },
  {
    name: "Ships Within",
    key: "ships_within",
    type: "list.single_line_text_field",
    description: "Seller fulfillment windows such as Same Day Delivery or 24 Hours. Supports multiple values. Written as a JSON array for Search & Discovery filters.",
  },
] as const;

export type RequiredCustomProductMetafield = (typeof REQUIRED_CUSTOM_PRODUCT_METAFIELDS)[number];

/** GraphQL equivalents of REST `visible_to_storefront_api` and `is_filterable`. */
export const REQUIRED_METAFIELD_STOREFRONT_ACCESS = "PUBLIC_READ";
export const REQUIRED_METAFIELD_CAPABILITIES = {
  adminFilterable: { enabled: true },
  smartCollectionCondition: { enabled: true },
} as const;

export function definitionMatchesRequired(
  definition: { namespace?: string | null; key?: string | null; constraints?: { key?: string | null } | null },
  spec: { key: string },
) {
  return (
    String(definition.namespace || "") === "custom" &&
    String(definition.key || "") === spec.key &&
    !definition.constraints?.key
  );
}
