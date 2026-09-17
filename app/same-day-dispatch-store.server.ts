import { Prisma } from "@prisma/client";
import db from "./db.server";
import { unauthenticated } from "./shopify.server";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { createSameDayDispatcher, safeCourierTrackingUrl, type DispatchStore } from "./same-day-dispatch.server.ts";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { readSameDayOrder } from "./same-day-order.server.ts";
// @ts-ignore Node strip-types imports
import { reconcileFulfillmentLifecycle } from "./fulfillment-service-lifecycle.server.ts";
// @ts-ignore Node strip-types imports
import { parseCourierDispatchData } from "./courier-dispatch-data.server.ts";
// @ts-ignore Node strip-types imports
import { fingerprint, sellerProvisioningReady } from "./same-day-provisioning-state.server.ts";
// @ts-ignore Node strip-types imports
import { reconcileSellerOrder } from "./same-day-reconciliation.server.ts";
// @ts-ignore Node strip-types imports
import { schedulerForShop } from "./same-day-shopify.server.ts";
import { randomUUID } from "node:crypto";

const store: DispatchStore = {
  get: (sellerId, shopifyOrderId) => db.sellerOrderFulfillment.findUnique({ where: { sellerId_shopifyOrderId: { sellerId, shopifyOrderId } } }),
  seller: (id) => db.seller.findUnique({ where: { id }, omit: { sameDayProvisioningData: false },
    include: { storeHours: true } }),
  ownership: async (shopifyOrderId) => {
    const sales = await db.sellerLedgerEntry.findMany({ where: { shopifyOrderId, entryType: "SALE" },
      select: { sellerId: true, shopifyLineItemId: true } });
    const sellerIds = [...new Set(sales.map((sale) => sale.sellerId))];
    const selected = await db.sellerProduct.findMany({ where: { sellerId: { in: sellerIds }, shopifyProductId: { not: null } }, select: { shopifyProductId: true } });
    const productIds = selected.flatMap(p => { const id = p.shopifyProductId!.split("/").pop()!; return [id, `gid://shopify/Product/${id}`]; });
    const products = await db.sellerProduct.findMany({ where: { shopifyProductId: { in: productIds } },
      select: { sellerId: true, shopifyProductId: true } });
    return {
      sales: sales.filter((sale) => sale.shopifyLineItemId).map((sale) => ({ sellerId: sale.sellerId, lineId: sale.shopifyLineItemId! })),
      products: products.map((product) => ({ sellerId: product.sellerId, productId: product.shopifyProductId!.startsWith("gid://")
        ? product.shopifyProductId! : `gid://shopify/Product/${product.shopifyProductId}` })),
    };
  },
  replace: async (previous, patch) => {
    const { courierDispatchData, ...rest } = patch;
    const result = await db.sellerOrderFulfillment.updateMany({
      where: { id: previous.id, sellerId: previous.sellerId, shopifyOrderId: previous.shopifyOrderId,
        fulfillmentMethod: "HAIRGRAB_SAME_DAY", status: previous.status,
        courierStatus: previous.courierStatus, courierDeliveryId: previous.courierDeliveryId,
        courierDispatchData: { equals: previous.courierDispatchData === null ? Prisma.DbNull : previous.courierDispatchData as Prisma.InputJsonValue },
      },
      data: { ...rest, ...(courierDispatchData === undefined ? {} : { courierDispatchData: courierDispatchData as Prisma.InputJsonValue }) },
    });
    return result.count === 1;
  },
};

const dispatch = createSameDayDispatcher(store, async (orderId) => {
  // Follow the existing marketplace offline-session convention; fail closed if
  // multiple distinct marketplace shops are present instead of choosing one.
  const sessions = await db.session.findMany({ where: { isOnline: false }, select: { shop: true } });
  const shops = [...new Set(sessions.map((session) => session.shop))];
  if (shops.length !== 1) throw new Error("Marketplace shop could not be determined.");
  const { admin } = await unauthenticated.admin(shops[0]);
  return { shop: shops[0], order: await readSameDayOrder(admin, orderId) };
});

/** Reconciles one existing seller/order. No courier creation or assignment is possible here. */
export async function reconcileSellerFulfillment(sellerId: string, orderId: string, expectedShop?: string) {
  const sessions = await db.session.findMany({ where: { isOnline: false }, select: { shop: true } });
  const shops = [...new Set(sessions.map(s => s.shop))];
  if (shops.length !== 1) throw new Error("MARKETPLACE_SHOP_AMBIGUOUS");
  if (expectedShop && shops[0] !== expectedShop) throw new Error("MARKETPLACE_SHOP_MISMATCH");
  const shop = shops[0]; const { admin } = await unauthenticated.admin(shop);
  const seller = await db.seller.findUnique({ where: { id: sellerId }, omit: { sameDayProvisioningData: false } });
  let record = await store.get(sellerId, orderId);
  if (!seller?.shopifyFulfillmentLocationId || !seller.shopifyFulfillmentServiceId || (record && record.fulfillmentMethod !== "HAIRGRAB_SAME_DAY")) throw new Error("FULFILLMENT_MAPPING_MISSING");
  if (!record) {
    const order = await readSameDayOrder(admin, orderId);
    const ownership = await store.ownership(orderId);
    const ids = order.lines.filter(l => {
      const owners = new Set(ownership.products.filter(p => p.productId === l.productId).map(p => p.sellerId));
      const sales = new Set(ownership.sales.filter(s => s.lineId === l.lineId).map(s => s.sellerId));
      if (owners.size !== 1 || sales.size !== 1 || [...owners][0] !== [...sales][0]) throw new Error("AMBIGUOUS_PRODUCT_OWNERSHIP");
      return owners.has(sellerId);
    }).map(l => l.lineId);
    reconcileSellerOrder(order, sellerId, seller.shopifyFulfillmentLocationId, ids, false);
    // Booking is not physical readiness. No courier call or readyForPickupAt write.
    await db.sellerOrderFulfillment.upsert({ where: { sellerId_shopifyOrderId: { sellerId, shopifyOrderId: orderId } },
      create: { sellerId, shopifyOrderId: orderId, shopifyOrderName: order.name, fulfillmentMethod: "HAIRGRAB_SAME_DAY", status: "AWAITING_SELLER_READY" }, update: {} });
    record = await store.get(sellerId, orderId);
    if (!record || record.fulfillmentMethod !== "HAIRGRAB_SAME_DAY") throw new Error("FULFILLMENT_MAPPING_CHANGED");
  }
  let snapshot = record.courierDispatchData ? parseCourierDispatchData(record.courierDispatchData) : null;
  if (["QUOTING", "CREATING", "ASSIGNING", "CANCELING", "ESTIMATING"].includes(record.courierStatus || "")) throw new Error("COURIER_OPERATION_REQUIRES_RECONCILIATION");
  if (snapshot && (snapshot.shop !== shop || snapshot.sellerId !== sellerId || snapshot.orderId !== orderId)) throw new Error("DISPATCH_IDENTITY_MISMATCH");
  if (!snapshot?.fulfillmentOrderId) {
    if (record.courierDeliveryId) throw new Error("LEGACY_DISPATCH_REQUIRES_REVIEW");
    const order = await readSameDayOrder(admin, orderId); const ownership = await store.ownership(orderId);
    const lines = order.lines.filter(l => {
      const owners = new Set(ownership.products.filter(p => p.productId === l.productId).map(p => p.sellerId));
      const sales = new Set(ownership.sales.filter(s => s.lineId === l.lineId).map(s => s.sellerId));
      if (owners.size !== 1 || sales.size !== 1 || [...owners][0] !== [...sales][0]) throw new Error("AMBIGUOUS_PRODUCT_OWNERSHIP");
      return owners.has(sellerId);
    }).map(({ lineId, quantity, name, unitPriceCents }) => ({ lineId, quantity, name, unitPriceCents }));
    const attribution = reconcileSellerOrder(order, sellerId, seller.shopifyFulfillmentLocationId, lines.map(l => l.lineId), false);
    snapshot = { version: 1, operationId: randomUUID(), operationAt: new Date().toISOString(),
      externalReference: `HG${orderId}S${fingerprint([shop, sellerId]).slice(0, 32)}`, shop, sellerId, orderId, lines,
      pickupFingerprint: fingerprint([seller.address1, seller.address2, seller.city, seller.state, seller.postalCode, seller.phone]),
      destinationFingerprint: fingerprint(order.destination), preflightProviderCostCents: null, assignmentEstimateCents: null,
      intendedShopperChargeCents: null, expectedMarginCents: null, pricingPolicyVersion: null, shopifyDeliveryChargeCents: null,
      actualShopifyDeliveryChargeCents: attribution.actualShopifyDeliveryChargeCents, shopperDeliveryChargeCents: attribution.actualShopifyDeliveryChargeCents,
      fulfillmentOrderId: attribution.fulfillmentOrderId, currency: "USD", cancellationRequestedAt: null,
      assignmentBilling: null, latestBilling: null, cancellationBilling: null };
    if (!await store.replace(record, { courierDispatchData: snapshot })) throw new Error("DISPATCH_CHANGED");
    record = { ...record, courierDispatchData: snapshot };
  }
  return reconcileFulfillmentLifecycle({ fulfillmentOrderId: snapshot.fulfillmentOrderId!, locationId: seller.shopifyFulfillmentLocationId,
    lineIds: snapshot.lines.map(l => l.lineId), eligible: sellerProvisioningReady(seller), courierStatus: record.courierStatus,
    quantities: Object.fromEntries(snapshot.lines.map(l => [l.lineId, l.quantity])),
    courierExists: !!record.courierDeliveryId || ["CREATING", "CREATE_UNCERTAIN", "ASSIGNING", "ASSIGN_UNCERTAIN"].includes(record.courierStatus || ""),
    trackingUrl: safeCourierTrackingUrl(record.trackingUrl) }, admin, schedulerForShop(shop), snapshot.shopifyLifecycle || { pending: null, fulfillmentId: null, updatedAt: new Date().toISOString() },
  async lifecycle => {
    const next = { ...snapshot!, operationId: randomUUID(), operationAt: new Date().toISOString(), shopifyLifecycle: lifecycle };
    if (!await store.replace(record!, { courierDispatchData: next })) throw new Error("DISPATCH_CHANGED");
    snapshot = next; record = { ...record!, courierDispatchData: next };
  }, process.env.HAIRGRAB_SAME_DAY_SHOPIFY_WRITES === "true");
}
export async function runSellerSameDayAction(sellerId: string, orderId: string, action: "ready" | "refresh" | "cancel") {
  if (action === "ready") {
    try { await reconcileSellerFulfillment(sellerId, orderId); }
    catch { return { success: false, message: "Shopify fulfillment reconciliation must complete before requesting a driver." }; }
  }
  const result = await dispatch(sellerId, orderId, action);
  try { await reconcileSellerFulfillment(sellerId, orderId); }
  catch { return { ...result, message: `${result.message} Shopify synchronization needs reconciliation.` }; }
  return result;
}
