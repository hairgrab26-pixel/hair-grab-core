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
    type: "single_line_text_field",
    description: "Lace size such as 13x4, used by HairGrab seller forms and storefront filters.",
  },
  {
    name: "Lace Type",
    key: "lace_type",
    type: "list.single_line_text_field",
    description: "Lace construction such as HD Lace. Supports multiple values.",
  },
] as const;

export type RequiredCustomProductMetafield = (typeof REQUIRED_CUSTOM_PRODUCT_METAFIELDS)[number];

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
