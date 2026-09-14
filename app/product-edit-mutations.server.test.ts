import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore Node's TypeScript stripping requires an explicit extension.
import { reconcileVariants, reconcileMedia } from "./product-edit-mutations.server.ts";

function mockAdmin() {
  const calls: Array<{ query: string; variables: any }> = [];
  return {
    calls,
    admin: { graphql: async (query: string, options?: { variables?: any }) => {
      calls.push({ query, variables: options?.variables });
      const name = query.includes("productVariantsBulkCreate") ? "productVariantsBulkCreate" :
        query.includes("productVariantsBulkUpdate") ? "productVariantsBulkUpdate" :
        query.includes("productVariantsBulkDelete") ? "productVariantsBulkDelete" :
        query.includes("inventorySetQuantities") ? "inventorySetQuantities" :
        query.includes("fileUpdate") ? "fileUpdate" : "productReorderMedia";
      return { json: async () => ({ data: { [name]: { productVariants: [{ id: "new-id" }], userErrors: [], mediaUserErrors: [], job: { id: "job" } } } }) };
    } },
  };
}

const baseline = [{ id: "v16", selectedOptions: [{ name: "Length", value: '16"' }], price: "100.00",
  compareAtPrice: null, sku: "S16", inventoryQuantity: 3, inventoryItemId: "i16" }];

test("unchanged Edit issues no variant or media mutations", async () => {
  const { admin, calls } = mockAdmin();
  await reconcileVariants(admin, "product", "location", { creates: [], updates: [], deletes: [] }, baseline);
  await reconcileMedia(admin, "product", { creates: [], detaches: [], reorder: false, order: ["media"] }, ["media"], []);
  assert.equal(calls.length, 0);
});

test("length addition retains old ID and creates only the requested combination", async () => {
  const { admin, calls } = mockAdmin();
  const ids = await reconcileVariants(admin, "product", "location", { creates: [{ selectedOptions: [{ name: "Length", value: '22"' }],
    price: "120.00", compareAtPrice: null, sku: "S22", inventoryQuantity: 2 }], updates: [], deletes: [] }, baseline);
  assert.deepEqual(ids, ["new-id"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].variables.variants[0].optionValues[0].name, '22"');
  assert.deepEqual(calls[0].variables.variants[0].inventoryQuantities, [{ locationId: "location", name: "available", quantity: 2 }]);
});

test("existing variant update targets its ID and explicit removal targets only that ID", async () => {
  const { admin, calls } = mockAdmin();
  await reconcileVariants(admin, "product", "location", { creates: [], updates: [{ ...baseline[0], price: "90.00", compareAtPrice: "100.00", sku: "NEW", inventoryQuantity: 5 }], deletes: [] }, baseline);
  assert.equal(calls[0].variables.variants[0].id, "v16");
  assert.equal(calls[0].variables.variants[0].price, "90.00");
  assert.equal(calls[1].variables.input.quantities[0].inventoryItemId, "i16");
  const second = mockAdmin();
  await reconcileVariants(second.admin, "product", "location", { creates: [{ selectedOptions: [{ name: "Length", value: '22"' }], price: "120", compareAtPrice: null, sku: null, inventoryQuantity: null }], updates: [], deletes: ["v16"] }, baseline);
  assert.deepEqual(second.calls[1].variables.variantsIds, ["v16"]);
});

test("media detach and reorder use existing IDs without recreation", async () => {
  const { admin, calls } = mockAdmin();
  await reconcileMedia(admin, "product", { creates: [], detaches: ["media-2"], reorder: true, order: ["media-3", "media-1"] },
    ["media-3", "media-1"], []);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].variables.files[0].referencesToRemove, ["product"]);
  assert.deepEqual(calls[1].variables.moves.map((move: any) => move.id), ["media-3", "media-1"]);
});

test("new media is staged, attached, and ordered by its new media ID", async () => {
  const calls: Array<{ query: string; variables: any }> = [];
  const admin = { graphql: async (query: string, options?: { variables?: any }) => {
    calls.push({ query, variables: options?.variables });
    const value = query.includes("stagedUploadsCreate") ? { stagedUploadsCreate: { stagedTargets: [{ url: "https://upload.example", resourceUrl: "https://resource.example",
      parameters: [] }], userErrors: [] } } : query.includes("productCreateMedia") ? { productCreateMedia: { media: [{ id: "new-media-id" }], userErrors: [], mediaUserErrors: [] } } :
      { productReorderMedia: { job: { id: "job" }, mediaUserErrors: [] } };
    return { json: async () => ({ data: value }) };
  } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true }) as Response;
  try {
    await reconcileMedia(admin, "product", { creates: [{ localKey: "new-key", alt: "photo.jpg" }], detaches: [], reorder: false, order: ["old-media"] },
      ["new-key", "old-media"], [{ key: "new-key", file: new File(["image"], "photo.jpg", { type: "image/jpeg" }) }]);
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(calls.length, 3);
  assert.equal(calls[1].variables.media[0].mediaContentType, "IMAGE");
  assert.deepEqual(calls[2].variables.moves.map((move: any) => move.id), ["new-media-id", "old-media"]);
});
