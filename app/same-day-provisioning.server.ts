import { randomUUID } from "node:crypto";
import type { Seller } from "@prisma/client";
// @ts-ignore Node strip-types imports
import { sameDaySellerEligible } from "./same-day-delivery.server.ts";
// @ts-ignore Node strip-types imports
import { fingerprint, GATES, normalizePickup, pickupMatches, readProvisioningJournal, type Gate, type ProvisioningJournal } from "./same-day-provisioning-state.server.ts";
// @ts-ignore Node strip-types imports
import { ShopifyFailure, ShopifyScheduler, SERVICES_QUERY, SERVICE_CREATE, LOCATION_EDIT, type AdminClient } from "./same-day-shopify.server.ts";
export type ProvisioningSeller = Pick<Seller, "id" | "sellerCode" | "businessName" | "phone" | "address1" | "address2" | "city" | "state" | "postalCode" | "country" | "status" | "offersSameDayDelivery" | "shopifyFulfillmentServiceId" | "shopifyFulfillmentLocationId" | "sameDayProvisioningStatus"> & { sameDayProvisioningData: unknown; sameDayProvisioningError?: string | null };
export type ProvisioningStore = {
  getSeller(id: string): Promise<ProvisioningSeller | null>;
  compareAndSet(before: ProvisioningSeller, patch: Record<string, unknown>): Promise<boolean>;
};
export type ProvisioningContext = {
  shop: string; admin: AdminClient; scheduler: ShopifyScheduler; writesAllowed: boolean;
  ownedServiceIds(): Promise<string[]>;
  inventory(seller: ProvisioningSeller, checkpoint: (hash: string) => Promise<void>): Promise<{ ready: boolean; reason?: string }>;
  delivery(seller: ProvisioningSeller, journal: ProvisioningJournal,
    mutate: (kind: "DELIVERY_UPDATE", target: string, hash: string, write: () => Promise<void>, verify: () => Promise<boolean>) => Promise<void>,
    baseline: (profile: string, hash: string) => Promise<void>): Promise<{ ready: boolean; reason?: string }>;
  readiness(): Promise<boolean>;
};
export type ProvisioningResult = { sellerId: string; ok: boolean; reason?: string };

export function createSameDayProvisioner(store: ProvisioningStore, now = Date.now) {
  return async function provision(sellerId: string, ctx: ProvisioningContext, action: "provision" | "reconcile" = "provision"): Promise<ProvisioningResult> {
    let seller = await store.getSeller(sellerId);
    if (!seller) return { sellerId, ok: false, reason: "SELLER_NOT_FOUND" };
    let journal: ProvisioningJournal;
    try {
      const prior = readProvisioningJournal(seller.sameDayProvisioningData);
      if (prior && prior.shop !== ctx.shop) throw new Error("SHOP_MISMATCH");
      if (prior?.owner && Date.parse(prior.leaseUntil) > now()) return { sellerId, ok: false, reason: "BUSY" };
      if (!seller.offersSameDayDelivery) return { sellerId, ok: false, reason: "DISABLED" };
      journal = { version: 1, shop: ctx.shop, operationId: prior?.pending ? prior.operationId : randomUUID(), owner: randomUUID(),
        startedAt: prior?.pending ? prior.startedAt : new Date(now()).toISOString(), updatedAt: new Date(now()).toISOString(),
        leaseUntil: new Date(now() + 120000).toISOString(), action, completed: [], lastVerifiedStep: null,
        pending: prior?.pending || null, retries: { count: 0, nextAttemptAt: null }, fingerprints: prior?.fingerprints || {} };
      const patch = { sameDayProvisioningStatus: "PROVISIONING", sameDayProvisioningData: structuredClone(journal),
        sameDayProvisioningAttemptedAt: new Date(now()), sameDayProvisioningError: null };
      if (!await store.compareAndSet(seller, patch)) return { sellerId, ok: false, reason: "BUSY" };
      seller = { ...seller, ...patch };
    } catch { return { sellerId, ok: false, reason: "INVALID_RECOVERY_STATE" }; }
    const save = async (patch: Record<string, unknown> = {}) => {
      journal.updatedAt = new Date(now()).toISOString(); journal.leaseUntil = new Date(now() + 120000).toISOString();
      const update = { ...patch, sameDayProvisioningData: structuredClone(journal) };
      if (!await store.compareAndSet(seller!, update)) throw new Error("OPERATION_OWNERSHIP_LOST");
      seller = { ...seller!, ...update };
    };
    const gate = async (g: Gate) => { if (!journal.completed.includes(g)) journal.completed.push(g); journal.lastVerifiedStep = g; await save(); };
    const retry = async (count: number, delay: number) => { journal.retries = { count, nextAttemptAt: new Date(now() + delay).toISOString() }; await save(); };
    const readServices = async () => {
      const data = await ctx.scheduler.request(ctx.admin, SERVICES_QUERY, {}, false, retry);
      if (!Array.isArray(data.shop?.fulfillmentServices)) throw new Error("INVALID_SERVICES_RESPONSE");
      return data.shop.fulfillmentServices as any[];
    };
    const mutate = async (kind: "SERVICE_CREATE" | "LOCATION_EDIT" | "DELIVERY_UPDATE", target: string, hash: string, write: () => Promise<void>, verify: () => Promise<boolean>) => {
      if (journal.pending) {
        if (journal.pending.kind !== kind || journal.pending.fingerprint !== hash || journal.pending.target !== target) throw new Error("PENDING_MUTATION_REQUIRES_RECONCILIATION");
        if (!await verify()) throw new Error("UNKNOWN_WRITE_REQUIRES_REVIEW");
        journal.pending = null; await save(); return;
      }
      if (await verify()) return;
      if (!ctx.writesAllowed || action === "reconcile") throw new Error("CONFIGURATION_CHANGE_REQUIRED");
      journal.pending = { kind, target, fingerprint: hash }; await save();
      try { await ctx.scheduler.withWriteGuard(() => save(), write); }
      catch (error) {
        if (error instanceof ShopifyFailure && !error.uncertain) { journal.pending = null; await save(); throw error; }
        if (!await verify()) throw new Error("UNKNOWN_WRITE_REQUIRES_REVIEW");
      }
      if (!await verify()) throw new Error("WRITE_NOT_VERIFIED");
      journal.pending = null; await save();
    };
    try {
      if (!sameDaySellerEligible(seller)) throw new Error("SELLER_INELIGIBLE");
      const pickup = normalizePickup(seller); await gate("eligibility");
      const name = `HairGrab Same-Day - ${seller.sellerCode}`; let service: any;
      const findService = async () => {
        const services = await readServices(); const owned = new Set(await ctx.ownedServiceIds());
        const matches = services.filter(s => s.serviceName === name);
        if (matches.length > 1) throw new Error("AMBIGUOUS_SERVICE_IDENTITY");
        service = seller!.shopifyFulfillmentServiceId ? services.find(s => s.id === seller!.shopifyFulfillmentServiceId) : matches[0];
        if (seller!.shopifyFulfillmentServiceId && !service) throw new Error("PERSISTED_SERVICE_MISSING");
        if (service && (!owned.has(service.id) || service.serviceName !== name || (matches.length && matches[0].id !== service.id))) throw new Error("SERVICE_OWNERSHIP_MISMATCH");
        return !!service;
      };
      const exists = await findService();
      if (!exists || journal.pending?.kind === "SERVICE_CREATE") await mutate("SERVICE_CREATE", name, fingerprint({ name }), async () => {
        await ctx.scheduler.request(ctx.admin, SERVICE_CREATE, { name }, true, retry);
      }, findService);
      if (!service?.location?.id || !service.location.isFulfillmentService || !service.location.isActive) throw new Error("INVALID_SERVICE_LOCATION");
      if (seller.shopifyFulfillmentLocationId && seller.shopifyFulfillmentLocationId !== service.location.id) throw new Error("LOCATION_IDENTITY_MISMATCH");
      if (service.inventoryManagement || service.trackingSupport || !service.requiresShippingMethod || service.callbackUrl) throw new Error("SERVICE_CONFIGURATION_REQUIRES_REVIEW");
      await save({ shopifyFulfillmentServiceId: service.id, shopifyFulfillmentLocationId: service.location.id });
      await gate("service"); await gate("location");
      const pickupHash = fingerprint(pickup);
      if (journal.pending?.kind !== "DELIVERY_UPDATE") await mutate("LOCATION_EDIT", service.location.id, pickupHash, async () => {
        await ctx.scheduler.request(ctx.admin, LOCATION_EDIT, { id: service.location.id, input: { address: pickup } }, true, retry);
      }, async () => { await findService(); return pickupMatches(service.location.address, pickup); });
      if (!pickupMatches(service.location.address, pickup) || !service.location.addressVerified) throw new Error("LOCATION_ADDRESS_NOT_VERIFIED");
      journal.fingerprints.pickup = pickupHash; await gate("address");
      const inventory = await ctx.inventory(seller!, async hash => { journal.fingerprints.inventory = hash; await save(); });
      if (!inventory.ready) throw new Error(inventory.reason || "INVENTORY_ALLOCATION_REQUIRED"); await gate("inventory");
      const delivery = await ctx.delivery(seller!, journal, mutate, async (id, hash) => { journal.fingerprints.delivery ||= {}; journal.fingerprints.delivery[id] = hash; await save(); });
      if (!delivery.ready) throw new Error(delivery.reason || "DELIVERY_CONFIGURATION_REQUIRED");
      await gate("delivery"); await gate("carrier");
      if (!await ctx.readiness()) throw new Error("LIFECYCLE_NOT_READY");
      await gate("lifecycle"); await gate("reconciliation");
      if (journal.pending || !GATES.every(g => journal.completed.includes(g))) throw new Error("INCOMPLETE_GATES");
      journal.owner = null; journal.retries = { count: 0, nextAttemptAt: null };
      await save({ sameDayProvisioningStatus: "READY", sameDayProvisionedAt: new Date(now()), sameDayProvisioningError: null });
      return { sellerId, ok: true };
    } catch (error) {
      const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "PROVISIONING_FAILED";
      journal.owner = null;
      try { await save({ sameDayProvisioningStatus: "FAILED", sameDayProvisioningError: code }); } catch { /* A newer owner or disable wins. */ }
      return { sellerId, ok: false, reason: code };
    }
  };
}
export async function provisionSameDaySellerBatch(ids: string[], context: ProvisioningContext, provision: ReturnType<typeof createSameDayProvisioner>, options: { batchSize?: number; concurrency?: number; action?: "provision" | "reconcile" } = {}) {
  if (!ids.length || ids.length > 100 || ids.some(id => typeof id !== "string" || !id)) throw new Error("SELECT_1_TO_100_SELLERS");
  const selected = [...new Set(ids)]; const size = Math.max(1, Math.min(25, Math.floor(options.batchSize || 10)));
  const concurrency = Math.max(1, Math.min(4, Math.floor(options.concurrency || 2))); const results: ProvisioningResult[] = [];
  for (let offset = 0; offset < selected.length; offset += size) {
    const batch = selected.slice(offset, offset + size); let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, size) }, async () => {
      while (cursor < batch.length) { const id = batch[cursor++];
        try { results.push(await provision(id, context, options.action)); }
        catch { results.push({ sellerId: id, ok: false, reason: "STORAGE_UNAVAILABLE" }); }
      }
    }));
  }
  return results;
}
