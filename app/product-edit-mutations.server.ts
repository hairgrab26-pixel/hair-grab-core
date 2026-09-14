import { randomUUID } from "node:crypto";
import type { ShopifyVariantSnapshot } from "./product-builder-model";

type Admin = { graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<{ json: () => Promise<any> }> };

async function mutate(admin: Admin, query: string, variables: Record<string, unknown>, resultName: string) {
  const response = await admin.graphql(query, { variables });
  const json = await response.json();
  const errors = [...(json.errors || []), ...(json.data?.[resultName]?.userErrors || []), ...(json.data?.[resultName]?.mediaUserErrors || [])];
  if (errors.length) throw new Error(errors.map((error: { message?: string }) => error.message || "Shopify rejected the edit").join(" | "));
  const result = json.data?.[resultName];
  if (!result) throw new Error(`Shopify did not return ${resultName}`);
  return result;
}

export async function reconcileVariants(admin: Admin, productId: string, locationId: string,
  diff: { creates: Array<Omit<ShopifyVariantSnapshot, "id" | "inventoryItemId">>; updates: ShopifyVariantSnapshot[]; deletes: string[] },
  baseline: ShopifyVariantSnapshot[]) {
  const baselineById = new Map(baseline.map((item) => [item.id, item]));
  const createdIds: string[] = [];
  if (diff.deletes.length >= baseline.length + diff.creates.length) throw new Error("A product must retain at least one variant");
  if (diff.creates.length) {
    const result = await mutate(admin, `#graphql
      mutation HairGrabEditCreateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          productVariants { id inventoryItem { id } }
          userErrors { field message }
        }
      }`, { productId, variants: diff.creates.map((item) => ({
        optionValues: item.selectedOptions.map((option) => ({ optionName: option.name, name: option.value })),
        price: item.price, compareAtPrice: item.compareAtPrice,
        inventoryItem: { sku: item.sku || null, tracked: item.inventoryQuantity !== null },
        ...(item.inventoryQuantity !== null ? { inventoryQuantities: [{ locationId, name: "available", quantity: item.inventoryQuantity }] } : {}),
      })) }, "productVariantsBulkCreate");
    if ((result.productVariants || []).length !== diff.creates.length) throw new Error("Shopify did not return every created variant");
    createdIds.push(...result.productVariants.map((item: { id: string }) => item.id));
  }
  if (diff.updates.length) {
    await mutate(admin, `#graphql
      mutation HairGrabEditUpdateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id }
          userErrors { field message }
        }
      }`, { productId, variants: diff.updates.map((item) => {
        const before = baselineById.get(item.id)!;
        return { id: item.id,
          ...(item.price !== before.price ? { price: item.price } : {}),
          ...(item.compareAtPrice !== before.compareAtPrice ? { compareAtPrice: item.compareAtPrice } : {}),
          ...(item.sku !== before.sku ? { inventoryItem: { sku: item.sku } } : {}),
          ...(JSON.stringify(item.selectedOptions) !== JSON.stringify(before.selectedOptions) ? {
            optionValues: item.selectedOptions.map((option) => ({ optionName: option.name, name: option.value })),
          } : {}),
        };
      }) }, "productVariantsBulkUpdate");
    const quantities = diff.updates.flatMap((item) => {
      const before = baselineById.get(item.id)!;
      return item.inventoryQuantity === before.inventoryQuantity || item.inventoryQuantity === null ? [] : [{
        inventoryItemId: item.inventoryItemId, locationId, quantity: item.inventoryQuantity,
        changeFromQuantity: null,
      }];
    });
    if (quantities.some((item) => !item.inventoryItemId)) throw new Error("Existing variant has no inventory item ID");
    await setInventory(admin, quantities, productId);
  }
  if (diff.deletes.length) {
    await mutate(admin, `#graphql
      mutation HairGrabEditDeleteVariants($productId: ID!, $variantsIds: [ID!]!) {
        productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
          product { id }
          userErrors { field message }
        }
      }`, { productId, variantsIds: diff.deletes }, "productVariantsBulkDelete");
  }
  return createdIds;
}

async function setInventory(admin: Admin, quantities: Array<Record<string, unknown>>, productId: string) {
  if (!quantities.length) return;
  await mutate(admin, `#graphql
    mutation HairGrabEditInventory($input: InventorySetQuantitiesInput!, $key: String!) {
      inventorySetQuantities(input: $input) @idempotent(key: $key) { userErrors { field message } }
    }`, { key: randomUUID(), input: { name: "available", reason: "correction",
      referenceDocumentUri: `hairgrab://seller-product/${productId}`, ignoreCompareQuantity: true, quantities } }, "inventorySetQuantities");
}

async function stageMedia(admin: Admin, files: Array<{ key: string; file: File }>) {
  if (!files.length) return [];
  const input = files.map(({ file }) => ({ filename: file.name, mimeType: file.type || (file.type.startsWith("video/") ? "video/mp4" : "image/jpeg"),
    httpMethod: "POST", resource: file.type.startsWith("video/") ? "VIDEO" : "PRODUCT_IMAGE",
    ...(file.type.startsWith("video/") ? { fileSize: String(file.size) } : {}) }));
  const result = await mutate(admin, `#graphql
    mutation HairGrabEditStageMedia($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } }
    }`, { input }, "stagedUploadsCreate");
  const targets = result.stagedTargets || [];
  if (targets.length !== files.length) throw new Error("Shopify returned an incomplete staged upload list");
  const sources: Array<{ key: string; originalSource: string; mediaContentType: "IMAGE" | "VIDEO"; alt: string }> = [];
  for (let index = 0; index < files.length; index++) {
    const { key, file } = files[index];
    const target = targets[index];
    const body = new FormData();
    for (const parameter of target.parameters) body.append(parameter.name, parameter.value);
    body.append("file", file, file.name);
    const upload = await fetch(target.url, { method: "POST", body });
    if (!upload.ok) throw new Error(`Upload failed for ${file.name}`);
    sources.push({ key, originalSource: target.resourceUrl, mediaContentType: file.type.startsWith("video/") ? "VIDEO" : "IMAGE", alt: file.name });
  }
  return sources;
}

export async function reconcileMedia(admin: Admin, productId: string,
  diff: { creates: Array<{ localKey: string; alt: string | null }>; detaches: string[]; reorder: boolean; order: string[] },
  fullOrder: string[], files: Array<{ key: string; file: File }>) {
  const expected = new Set(diff.creates.map((item) => item.localKey));
  if (files.length !== expected.size || files.some((item) => !expected.has(item.key))) throw new Error("Uploaded media does not match the requested media additions");
  const staged = await stageMedia(admin, files);
  const newIds = new Map<string, string>();
  if (staged.length) {
    const result = await mutate(admin, `#graphql
      mutation HairGrabEditAddMedia($productId: ID!, $media: [CreateMediaInput!]!) {
        productCreateMedia(productId: $productId, media: $media) {
          media { id }
          mediaUserErrors { field message }
          userErrors { field message }
        }
      }`, { productId, media: staged.map((item) => ({ originalSource: item.originalSource,
        mediaContentType: item.mediaContentType, alt: item.alt })) }, "productCreateMedia");
    if ((result.media || []).length !== staged.length) throw new Error("Shopify did not return every newly attached media ID");
    staged.forEach((item, index) => newIds.set(item.key, result.media[index].id));
  }
  if (diff.detaches.length) {
    await mutate(admin, `#graphql
      mutation HairGrabEditDetachMedia($files: [FileUpdateInput!]!) {
        fileUpdate(files: $files) { files { id } userErrors { field message } }
      }`, { files: diff.detaches.map((id) => ({ id, referencesToRemove: [productId] })) }, "fileUpdate");
  }
  const desiredIds = fullOrder.map((key) => newIds.get(key) || key);
  const reorderNeeded = diff.reorder || staged.length > 0;
  if (reorderNeeded && desiredIds.length) {
    await mutate(admin, `#graphql
      mutation HairGrabEditReorderMedia($id: ID!, $moves: [MoveInput!]!) {
        productReorderMedia(id: $id, moves: $moves) { job { id } mediaUserErrors { field message } }
      }`, { id: productId, moves: desiredIds.map((id, index) => ({ id, newPosition: index })) }, "productReorderMedia");
  }
}
