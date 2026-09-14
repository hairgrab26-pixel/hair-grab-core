/** Shopify's full product graph is the baseline for Edit. HairGrab-generated rows are only an overlay. */
export type ShopifyOptionAxis = {
  id?: string;
  name: string;
  values: Array<{ id?: string; name: string }>;
};

export type ShopifyVariantSnapshot = {
  id: string;
  selectedOptions: Array<{ name: string; value: string }>;
  price: string;
  compareAtPrice: string | null;
  sku: string | null;
  inventoryQuantity: number | null;
  inventoryItemId: string | null;
};

export type ShopifyMediaSnapshot = {
  id: string;
  mediaContentType: string;
  alt: string | null;
  url: string | null;
  position: number;
};

export type ExistingProductSnapshot = {
  options: ShopifyOptionAxis[];
  variants: ShopifyVariantSnapshot[];
  media: ShopifyMediaSnapshot[];
};

export type VariantEditState = {
  /** Existing IDs remain present even when their option combination is not editable in HairGrab. */
  existing: ShopifyVariantSnapshot[];
  changes: Array<ShopifyVariantSnapshot & { id: string }>;
  additions: Array<Omit<ShopifyVariantSnapshot, "id" | "inventoryItemId">>;
  removedIds: string[];
};

export type MediaEditState = {
  existing: ShopifyMediaSnapshot[];
  added: Array<{ localKey: string; alt: string | null }>;
  removedIds: string[];
  order: string[];
};

export type VariantFields = { price: string; salePrice: string; inventory: string; sku: string };

export function serializeMetafieldValue(typeName: string, value: unknown): string {
  if (typeName === "json") {
    if (typeof value === "string") {
      try {
        JSON.parse(value);
        return value;
      } catch {
        return JSON.stringify(value);
      }
    }
    return JSON.stringify(value);
  }
  if (typeName.startsWith("list.")) {
    if (Array.isArray(value)) return JSON.stringify(value);
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return value;
      } catch {
        // Plain text is a single list member.
      }
      return JSON.stringify([value]);
    }
    return JSON.stringify([value]);
  }
  return typeof value === "boolean" ? String(value) : String(value ?? "");
}

export function variantFieldsFromShopify(variant: ShopifyVariantSnapshot): VariantFields {
  return {
    price: variant.compareAtPrice || variant.price,
    salePrice: variant.compareAtPrice ? variant.price : "",
    inventory: variant.inventoryQuantity === null ? "" : String(variant.inventoryQuantity),
    sku: variant.sku || "",
  };
}

export function variantFieldsToShopify(variant: ShopifyVariantSnapshot, fields: VariantFields, onSale: boolean): ShopifyVariantSnapshot {
  return { ...variant,
    price: onSale && fields.salePrice ? fields.salePrice : fields.price,
    compareAtPrice: onSale && fields.salePrice ? fields.price : null,
    inventoryQuantity: fields.inventory === "" ? null : Number(fields.inventory),
    sku: fields.sku.trim() || null,
  };
}

export function hydrateVariantEditState(snapshot: ExistingProductSnapshot): VariantEditState {
  return { existing: snapshot.variants, changes: [], additions: [], removedIds: [] };
}

export function hydrateMediaEditState(snapshot: ExistingProductSnapshot): MediaEditState {
  return {
    existing: snapshot.media,
    added: [],
    removedIds: [],
    order: snapshot.media.map((item) => item.id),
  };
}

function sameOptions(
  left: ShopifyVariantSnapshot["selectedOptions"],
  right: ShopifyVariantSnapshot["selectedOptions"],
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function diffVariants(baseline: ShopifyVariantSnapshot[], desired: VariantEditState) {
  const original = new Map(baseline.map((variant) => [variant.id, variant]));
  const removed = new Set(desired.removedIds);
  if (removed.size !== desired.removedIds.length) throw new Error("Duplicate variant removal");
  if (new Set(desired.changes.map((item) => item.id)).size !== desired.changes.length) throw new Error("Duplicate variant edit");
  const updates: ShopifyVariantSnapshot[] = [];
  for (const change of desired.changes) {
    const before = original.get(change.id);
    if (!before || removed.has(change.id)) throw new Error(`Invalid variant edit: ${change.id}`);
    if (!sameOptions(before.selectedOptions, change.selectedOptions) ||
      before.price !== change.price || before.compareAtPrice !== change.compareAtPrice ||
      before.sku !== change.sku || before.inventoryQuantity !== change.inventoryQuantity) {
      updates.push(change);
    }
  }
  for (const id of removed) if (!original.has(id)) throw new Error(`Invalid variant removal: ${id}`);
  const keys = new Set<string>();
  for (const variant of [...baseline.filter((item) => !removed.has(item.id) && !desired.changes.some((change) => change.id === item.id)),
      ...desired.changes.filter((item) => !removed.has(item.id)), ...desired.additions]) {
    if (!original.has((variant as ShopifyVariantSnapshot).id) || updates.includes(variant as ShopifyVariantSnapshot)) {
      if (!String(variant.price).trim() || !Number.isFinite(Number(variant.price)) || Number(variant.price) < 0) throw new Error("Every changed variant needs a valid price");
      if (variant.compareAtPrice !== null && (!Number.isFinite(Number(variant.compareAtPrice)) || Number(variant.compareAtPrice) <= Number(variant.price))) {
        throw new Error("Compare-at price must exceed the sale price");
      }
      if (variant.inventoryQuantity !== null && (!Number.isInteger(variant.inventoryQuantity) || variant.inventoryQuantity < 0)) {
        throw new Error("Inventory must be a nonnegative whole number");
      }
    }
    const key = JSON.stringify(variant.selectedOptions);
    if (keys.has(key)) throw new Error("Duplicate Shopify option combination");
    keys.add(key);
  }
  return { creates: desired.additions, updates, deletes: [...removed] };
}

export function diffMedia(baseline: ShopifyMediaSnapshot[], desired: MediaEditState) {
  const originalIds = baseline.map((item) => item.id);
  const original = new Set(originalIds);
  const removed = new Set(desired.removedIds);
  for (const id of removed) if (!original.has(id)) throw new Error(`Invalid media removal: ${id}`);
  const currentIds = desired.order.filter((id) => original.has(id) && !removed.has(id));
  const expectedIds = originalIds.filter((id) => !removed.has(id));
  if (currentIds.length !== expectedIds.length || new Set(currentIds).size !== expectedIds.length) {
    throw new Error("Media order must retain every media item not explicitly removed");
  }
  return {
    creates: desired.added,
    detaches: [...removed],
    reorder: JSON.stringify(currentIds) !== JSON.stringify(expectedIds),
    order: currentIds,
  };
}
