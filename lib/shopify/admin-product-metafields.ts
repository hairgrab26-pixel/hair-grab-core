export type AdminMetafieldSpec = {
  formKey: string;
  names: string[];
  key: string;
  tagLabels: string[];
  list?: boolean;
};

/** The 16 Shopify Admin product metafields HairGrab writes under custom.* */
export const ADMIN_PRODUCT_METAFIELDS: AdminMetafieldSpec[] = [
  { formKey: "weftType", names: ["Weft Type"], key: "weft_type", tagLabels: ["Weft Type"] },
  { formKey: "density", names: ["Density"], key: "density", tagLabels: ["Density"], list: true },
  { formKey: "origin", names: ["Origin"], key: "origin", tagLabels: ["Origin"] },
  { formKey: "lengths", names: ["Length"], key: "length", tagLabels: ["Length"], list: true },
  { formKey: "hairCategory", names: ["Hair Category"], key: "hair_category", tagLabels: ["Hair Category"] },
  {
    formKey: "shippingMethod",
    names: ["Shipping Method / Shipping Options", "Shipping Method / Shipping", "Shipping Method", "Shipping Methods"],
    key: "shipping_method",
    tagLabels: ["Shipping Method"],
  },
  { formKey: "colors", names: ["Color"], key: "color", tagLabels: ["Color"], list: true },
  { formKey: "showOnMap", names: ["Show on HairGrab Map"], key: "show_on_hairgrab_map", tagLabels: ["Show on HairGrab Map"] },
  { formKey: "returnPolicy", names: ["Return Policy"], key: "return_policy", tagLabels: ["Return Policy"] },
  { formKey: "shipsWithin", names: ["Ships Within"], key: "ships_within", tagLabels: ["Ships Within"], list: true },
  { formKey: "capType", names: ["Cap Type"], key: "cap_type", tagLabels: ["Cap Type"], list: true },
  { formKey: "shippingTerritory", names: ["Shipping Territory"], key: "shipping_territory", tagLabels: ["Shipping Territory"] },
  { formKey: "shipsFromState", names: ["Ships From State"], key: "ships_from_state", tagLabels: ["Ships From State", "State"] },
  { formKey: "shipsFromCity", names: ["Ships From City"], key: "ships_from_city", tagLabels: ["Ships From City", "City"] },
  { formKey: "material", names: ["Hair Type", "Material"], key: "hair_type", tagLabels: ["Hair Type", "Material"] },
  { formKey: "texture", names: ["Texture"], key: "texture", tagLabels: ["Texture"] },
];

export function adminMetafieldFallback(spec: AdminMetafieldSpec) {
  return {
    namespace: "custom" as const,
    key: spec.key,
    type: spec.list ? "list.single_line_text_field" : "single_line_text_field",
  };
}
