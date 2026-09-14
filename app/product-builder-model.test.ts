import assert from "node:assert/strict";
import test from "node:test";
import {
  diffMedia,
  diffVariants,
  hydrateMediaEditState,
  hydrateVariantEditState,
  variantFieldsFromShopify,
  variantFieldsToShopify,
  type ExistingProductSnapshot,
// @ts-ignore Node's TypeScript stripping requires the explicit extension.
} from "./product-builder-model.ts";

const snapshot: ExistingProductSnapshot = {
  options: [
    { name: "Length", values: [{ name: "16" }, { name: "18" }, { name: "20" }] },
    { name: "Lace", values: [{ name: "Transparent" }, { name: "HD" }] },
  ],
  variants: ["16", "18", "20"].flatMap((length) =>
    ["Transparent", "HD"].map((lace) => ({
      id: `gid://shopify/ProductVariant/${length}-${lace}`,
      selectedOptions: [{ name: "Length", value: length }, { name: "Lace", value: lace }],
      price: "120.00",
      compareAtPrice: "150.00",
      sku: `${length}-${lace}`,
      inventoryQuantity: 4,
      inventoryItemId: `gid://shopify/InventoryItem/${length}-${lace}`,
    }))),
  media: [
    { id: "image-1", mediaContentType: "IMAGE", alt: "Front", url: "https://example.com/1", position: 0 },
    { id: "video-1", mediaContentType: "VIDEO", alt: "Motion", url: "https://example.com/2", position: 1 },
    { id: "image-2", mediaContentType: "IMAGE", alt: null, url: "https://example.com/3", position: 2 },
  ],
};

test("arbitrary Shopify option graph round-trips without variant or media mutations", () => {
  const edit = hydrateVariantEditState(snapshot);
  edit.changes = snapshot.variants.map((variant) => variantFieldsToShopify(variant, variantFieldsFromShopify(variant), true));
  assert.deepEqual(diffVariants(snapshot.variants, edit), {
    creates: [], updates: [], deletes: [],
  });
  assert.deepEqual(diffMedia(snapshot.media, hydrateMediaEditState(snapshot)), {
    creates: [], detaches: [], reorder: false, order: ["image-1", "video-1", "image-2"],
  });
});

test("mixed sale and nonsale variants survive UI hydration and serialization", () => {
  const mixed = structuredClone(snapshot);
  mixed.variants[0].compareAtPrice = null;
  mixed.variants[1].compareAtPrice = "170.00";
  const edit = hydrateVariantEditState(mixed);
  edit.changes = mixed.variants.map((variant) => variantFieldsToShopify(variant, variantFieldsFromShopify(variant), true));
  assert.deepEqual(diffVariants(mixed.variants, edit), { creates: [], updates: [], deletes: [] });
});

test("adding lengths preserves all original combination IDs", () => {
  const edit = hydrateVariantEditState(snapshot);
  for (const length of ["22", "24"]) for (const lace of ["Transparent", "HD"]) {
    edit.additions.push({
      selectedOptions: [{ name: "Length", value: length }, { name: "Lace", value: lace }],
      price: "140.00", compareAtPrice: null, sku: null, inventoryQuantity: 0,
    });
  }
  const diff = diffVariants(snapshot.variants, edit);
  assert.equal(diff.creates.length, 4);
  assert.deepEqual(diff.updates, []);
  assert.deepEqual(diff.deletes, []);
});

test("only explicitly removed IDs are deleted; media order is deliberate", () => {
  const variants = hydrateVariantEditState(snapshot);
  variants.removedIds = [snapshot.variants[0].id];
  assert.deepEqual(diffVariants(snapshot.variants, variants).deletes, [snapshot.variants[0].id]);
  const media = hydrateMediaEditState(snapshot);
  media.order = ["image-2", "image-1", "video-1"];
  assert.equal(diffMedia(snapshot.media, media).reorder, true);
  media.removedIds = ["video-1"];
  media.order = ["image-2", "image-1"];
  assert.deepEqual(diffMedia(snapshot.media, media).detaches, ["video-1"]);
});
