import { productClassifications, productOptions } from "./components/ProductBuilder";
import { extensionTypeFromOptions, productTypeToCategoryLabel, type ProductType } from "./product-categories";
import { productAttributeTags, type ProductAttributeTagFields } from "./product-attribute-tags";

const WEFT_OPTION_VALUES = new Set(["WEFT", "NO_WEFT"]);

export function sellerAttributeTagInput(fields: ProductAttributeTagFields & {
  productType?: ProductType | string | null;
  selectedOptions?: string[] | null;
  searchClassifications?: string[] | null;
  lengths?: string[] | null;
}) {
  const productType = fields.productType as ProductType | undefined;
  const selected = fields.selectedOptions || [];
  const styleTypes = productType
    ? [
        ...(productOptions[productType] || [])
          .filter((item) => selected.includes(item.value) && !WEFT_OPTION_VALUES.has(item.value))
          .map((item) => item.label),
        ...(productClassifications[productType] || [])
          .filter((item) => (fields.searchClassifications || []).includes(item.value))
          .map((item) => item.label),
      ]
    : fields.styleTypes || [];

  return {
    ...fields,
    hairCategory: fields.hairCategory || (productType ? productTypeToCategoryLabel(productType) : ""),
    lengths: fields.lengths || [],
    extensionType:
      fields.extensionType ||
      (productType === "EXTENSION" ? extensionTypeFromOptions(selected) : ""),
    styleTypes,
  } satisfies ProductAttributeTagFields;
}

export function sellerProductAttributeTags(
  fields: ProductAttributeTagFields & {
    productType?: ProductType | string | null;
    selectedOptions?: string[] | null;
    searchClassifications?: string[] | null;
    lengths?: string[] | null;
  },
) {
  return productAttributeTags(sellerAttributeTagInput(fields));
}
