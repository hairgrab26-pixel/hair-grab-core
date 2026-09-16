import { Prisma } from "@prisma/client";
// @ts-ignore Node strip-types imports
import db from "./db.server.ts";
// @ts-ignore Node strip-types imports
import { configurationGates } from "./same-day-configuration.server.ts";
// @ts-ignore Node strip-types imports
import { createSameDayProvisioner, provisionSameDaySellerBatch, type ProvisioningContext, type ProvisioningStore } from "./same-day-provisioning.server.ts";
// @ts-ignore Node strip-types imports
import { readProvisioningJournal } from "./same-day-provisioning-state.server.ts";
// @ts-ignore Node strip-types imports
import { schedulerForShop, SCOPES_QUERY, type AdminClient } from "./same-day-shopify.server.ts";
export const provisioningStore: ProvisioningStore = {
  getSeller: id => db.seller.findUnique({ where: { id }, omit: { sameDayProvisioningData: false } }),
  compareAndSet: async (s, patch) => (await db.seller.updateMany({ where: {
    id: s.id, status: s.status, offersSameDayDelivery: s.offersSameDayDelivery,
    address1: s.address1, address2: s.address2, city: s.city, state: s.state, postalCode: s.postalCode, country: s.country, phone: s.phone,
    shopifyFulfillmentServiceId: s.shopifyFulfillmentServiceId, shopifyFulfillmentLocationId: s.shopifyFulfillmentLocationId,
    sameDayProvisioningStatus: s.sameDayProvisioningStatus,
    sameDayProvisioningData: { equals: s.sameDayProvisioningData === null ? Prisma.DbNull : s.sameDayProvisioningData as Prisma.InputJsonValue },
  }, data: patch as Prisma.SellerUpdateManyMutationInput })).count === 1,
};
export async function setSellerSameDayEnabled(id: string, enabled: boolean) {
  const seller = await provisioningStore.getSeller(id);
  if (!seller) throw new Error("SELLER_NOT_FOUND");
  // Keep journal (especially pending intent) and resource identities for recovery.
  if (!await provisioningStore.compareAndSet(seller, { offersSameDayDelivery: enabled,
    sameDayProvisioningStatus: enabled ? "NOT_STARTED" : "DISABLED", sameDayProvisioningError: null })) throw new Error("SELLER_CHANGED_RETRY");
}
export async function ownershipForSeller(id: string) {
  const selected = await db.sellerProduct.findMany({ where: { sellerId: id, shopifyProductId: { not: null } }, select: { shopifyProductId: true } });
  const ids = selected.flatMap(p => { const tail = p.shopifyProductId!.split("/").pop()!; return [tail, `gid://shopify/Product/${tail}`]; });
  return db.sellerProduct.findMany({ where: { shopifyProductId: { in: ids } }, select: { sellerId: true, shopifyProductId: true } });
}
export function productionProvisioningContext(shop: string, admin: AdminClient, token: string): ProvisioningContext {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) throw new Error("INVALID_SHOP");
  const scheduler = schedulerForShop(shop);
  const gates = configurationGates(admin, scheduler, ownershipForSeller);
  // GraphQL exposes all services but no creating-app field. REST current_client supplies
  // authoritative ownership for this single-merchant app, using the same session/token.
  const ownedServiceIds = async () => {
    const result = await scheduler.request({ graphql: async () => {
      const response = await fetch(`https://${shop}/admin/api/2026-07/fulfillment_services.json?scope=current_client`, {
        headers: { "X-Shopify-Access-Token": token }, signal: AbortSignal.timeout(20000), redirect: "error",
      });
      return { status: response.status, headers: response.headers, json: async () => ({ data: await response.json() }) };
    } }, "ownership");
    if (!Array.isArray(result.fulfillment_services)) throw new Error("OWNERSHIP_UNAVAILABLE");
    return result.fulfillment_services.map((s: any) => `gid://shopify/FulfillmentService/${s.id}`);
  };
  return { shop, admin, scheduler, ownedServiceIds, writesAllowed: process.env.HAIRGRAB_SAME_DAY_SHOPIFY_WRITES === "true", ...gates,
    readiness: async () => {
      const data = await scheduler.request(admin, SCOPES_QUERY);
      const scopes = new Set(data.currentAppInstallation?.accessScopes?.map((s: any) => s.handle));
      // The explicit deployment gate includes a working lifecycle reconciliation runner.
      // This release uses legacy delivery profiles; never mutate an opted-in Markets shop.
      return ["write_fulfillments", "write_assigned_fulfillment_orders", "write_shipping", "write_inventory"].every(s => scopes.has(s)) &&
        data.shop?.features?.marketDrivenShipping === false && process.env.HAIRGRAB_SAME_DAY_LIFECYCLE_READY === "true";
    } };
}
/** Cross-process shop lock: one controlled batch owns provisioning traffic/configuration.
 * Seller checkpoints commit independently; a lost request cannot roll them back. */
export async function runProvisioningBatch(ids: string[], context: ProvisioningContext,
  options: { batchSize?: number; concurrency?: number; action?: "provision" | "reconcile" } = {}) {
  await assertMarketplaceShop(context.shop);
  return db.$transaction(async tx => {
    const locks = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtext('hairgrab-same-day-provisioning'), hashtext(${context.shop})) AS locked`;
    if (!locks[0]?.locked) throw new Error("SHOP_PROVISIONING_BUSY");
    const access = await context.scheduler.request(context.admin, SCOPES_QUERY);
    if (access.shop?.features?.marketDrivenShipping !== false) throw new Error("MARKET_DRIVEN_SHIPPING_REQUIRES_REVIEW");
    return provisionSameDaySellerBatch(ids, context, createSameDayProvisioner(provisioningStore), options);
  }, { timeout: 600000, maxWait: 5000 });
}
export async function assertMarketplaceShop(shop: string) {
  const sessions = await db.session.findMany({ where: { isOnline: false }, select: { shop: true } });
  const shops = [...new Set(sessions.map(s => s.shop))];
  if (shops.length !== 1 || shops[0] !== shop) throw new Error("MARKETPLACE_SHOP_MISMATCH");
}
export async function provisioningStatus(ids: string[]) {
  const sellers = await db.seller.findMany({ where: { id: { in: ids } }, select: { id: true, sellerCode: true, businessName: true,
    offersSameDayDelivery: true, sameDayProvisioningStatus: true, sameDayProvisioningError: true, sameDayProvisioningData: true,
    sameDayProvisioningAttemptedAt: true, sameDayProvisionedAt: true } });
  return sellers.map(({ sameDayProvisioningData, ...s }) => {
    let j; try { j = readProvisioningJournal(sameDayProvisioningData); } catch { return { ...s, recovery: "INVALID_JOURNAL" }; }
    return { ...s, recovery: j ? { lastVerifiedStep: j.lastVerifiedStep, completed: j.completed, pending: j.pending?.kind || null, retries: j.retries.count, leaseUntil: j.owner ? j.leaseUntil : null } : null };
  });
}
