import type { ProductType } from "./product-categories";

export type CategoryAttributeField =
  | "texture"
  | "length"
  | "density"
  | "laceSize"
  | "laceType"
  | "capSize"
  | "capType"
  | "material"
  | "color"
  | "shipsWithin"
  | "weight"
  | "extensionType"
  | "styleType"
  | "origin"
  | "weftType";

export const CATEGORY_ATTRIBUTE_FIELDS: Record<ProductType, CategoryAttributeField[]> = {
  WIG: ["texture", "length", "density", "laceSize", "laceType", "capSize", "capType", "origin", "material", "color", "shipsWithin"],
  BUNDLE: ["texture", "length", "weight", "origin", "weftType", "material", "color", "shipsWithin"],
  EXTENSION: ["extensionType", "texture", "length", "weight", "origin", "weftType", "material", "color", "shipsWithin"],
  BRAIDING_HAIR: ["styleType", "texture", "length", "origin", "material", "color", "shipsWithin"],
  CLOSURE_FRONTAL: ["styleType", "texture", "length", "laceSize", "laceType", "origin", "weftType", "material", "color", "shipsWithin"],
  HAIR_ESSENTIAL: ["styleType", "color", "shipsWithin"],
};

export const CAP_SIZE_VALUES = ["Small", "Medium", "Large", "Adjustable"] as const;

export const CAP_TYPE_VALUES = [
  "Glueless",
  "Lace",
  "Full Lace",
  "360",
  "U-Part",
  "Silk Top",
] as const;

export function categoryShowsAttribute(
  productType: ProductType | null | undefined,
  field: CategoryAttributeField,
) {
  if (!productType) return false;
  return CATEGORY_ATTRIBUTE_FIELDS[productType].includes(field);
}

export function categoryMaterialLabel(productType: ProductType | null | undefined) {
  if (productType === "BUNDLE") return "Hair Material";
  if (productType === "BRAIDING_HAIR") return "Material / Fiber";
  return "Material";
}

export function isCapSizeValue(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  return CAP_SIZE_VALUES.some((item) => item.toLowerCase() === normalized);
}
