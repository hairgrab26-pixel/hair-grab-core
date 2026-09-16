// @ts-ignore Node strip-types imports
import { fingerprint, type ProvisioningJournal } from "./same-day-provisioning-state.server.ts";
// @ts-ignore Node strip-types imports
import { PRODUCT_INVENTORY_QUERY, DELIVERY_QUERY, DELIVERY_UPDATE, CARRIER_QUERY, type AdminClient, type ShopifyScheduler } from "./same-day-shopify.server.ts";
// @ts-ignore Node strip-types imports
import type { ProvisioningContext, ProvisioningSeller } from "./same-day-provisioning.server.ts";
export type Ownership = { sellerId: string; shopifyProductId: string | null };
export type InventoryRow = { productId: string; variantId: string; itemId: string; profileId: string; tracked: boolean;
  levels: { locationId: string; quantities: Record<string, number> }[] };
const gid = (id: string) => id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`;
function complete(connection: any): any[] {
  if (connection?.pageInfo?.hasNextPage !== false || !Array.isArray(connection.nodes)) throw new Error("CONFIGURATION_PAGE_INCOMPLETE");
  return connection.nodes;
}
/** Ownership rows include ALL owners for selected product IDs; never filter conflicts away. */
export async function readSellerInventory(sellerId: string, ownership: Ownership[], admin: AdminClient, scheduler: ShopifyScheduler): Promise<InventoryRow[]> {
  const ids = [...new Set(ownership.filter(p => p.sellerId === sellerId && p.shopifyProductId).map(p => gid(p.shopifyProductId!)))].sort();
  if (!ids.length) throw new Error("NO_SELLER_PRODUCTS");
  const rows: InventoryRow[] = [];
  for (const id of ids) {
    if (new Set(ownership.filter(p => p.shopifyProductId && gid(p.shopifyProductId) === id).map(p => p.sellerId)).size !== 1) throw new Error("AMBIGUOUS_PRODUCT_OWNERSHIP");
    let after: string | null = null; const seen = new Set<string>();
    do {
      const data = await scheduler.request(admin, PRODUCT_INVENTORY_QUERY, { id, after });
      if (data.product?.id !== id || !Array.isArray(data.product.variants?.nodes)) throw new Error("SELLER_PRODUCT_MISSING");
      for (const v of data.product.variants.nodes) {
        if (!v.inventoryItem?.id || !v.deliveryProfile?.id || rows.some(r => r.variantId === v.id || r.itemId === v.inventoryItem.id)) throw new Error("INVENTORY_IDENTITY_INVALID");
        const levels = complete(v.inventoryItem.inventoryLevels).map(l => {
          const quantities = Object.fromEntries(l.quantities.map((q: any) => [q.name, q.quantity]));
          if (!["available", "on_hand", "committed", "reserved", "incoming", "damaged", "safety_stock", "quality_control"].every(q => Number.isSafeInteger(quantities[q]))) throw new Error("INVENTORY_QUANTITIES_INCOMPLETE");
          return { locationId: l.location.id, quantities };
        }).sort((a, b) => a.locationId.localeCompare(b.locationId));
        rows.push({ productId: id, variantId: v.id, itemId: v.inventoryItem.id, profileId: v.deliveryProfile.id, tracked: v.inventoryItem.tracked, levels });
      }
      const page = data.product.variants.pageInfo;
      if (page?.hasNextPage === false) break;
      if (!page?.endCursor || seen.has(page.endCursor)) throw new Error("INVENTORY_PAGE_INCOMPLETE");
      after = page.endCursor; seen.add(after!);
    } while (true);
  }
  if (!rows.length) throw new Error("NO_SELLER_VARIANTS");
  return rows.sort((a, b) => a.itemId.localeCompare(b.itemId));
}
export function planInventory(rows: InventoryRow[], locationId: string) {
  const items = rows.map(row => {
    const target = row.levels.find(l => l.locationId === locationId);
    return { itemId: row.itemId, variantId: row.variantId, activationRequired: !target,
      tracked: row.tracked, availableAtTarget: target?.quantities.available ?? null,
      committedAtTarget: target?.quantities.committed ?? null, reservedAtTarget: target?.quantities.reserved ?? null,
      otherLocations: row.levels.filter(l => l.locationId !== locationId),
      allocationReviewRequired: !row.tracked || !target || (target.quantities.available <= 0 && row.levels.some(l => l.locationId !== locationId && l.quantities.available > 0)) };
  });
  // Read-only: activation is distinct from a transfer. Never fabricate quantities or move commitments.
  return { ready: items.every(i => !i.allocationReviewRequired), fingerprint: fingerprint(rows), items,
    reason: items.some(i => !i.tracked) ? "UNTRACKED_INVENTORY_REQUIRES_REVIEW" : "INVENTORY_ALLOCATION_REQUIRED" };
}
function rateFingerprint(profile: any, carrierId: string) {
  return fingerprint(profile.profileLocationGroups.map((g: any) => ({ id: g.locationGroup.id,
    zones: complete(g.locationGroupZones).map(z => ({ zone: z.zone,
      methods: complete(z.methodDefinitions).filter(m => m.rateProvider?.carrierService?.id !== carrierId) })) })));
}
export function planDelivery(profile: any, rows: InventoryRow[], locationId: string, carrierId: string) {
  if (!Array.isArray(profile?.profileLocationGroups)) throw new Error("DELIVERY_PROFILE_MISSING");
  const groups = profile.profileLocationGroups;
  for (const g of groups) { complete(g.locationGroup.locations); for (const z of complete(g.locationGroupZones)) complete(z.methodDefinitions); }
  const existing = groups.filter((g: any) => g.locationGroup.locations.nodes.some((l: any) => l.id === locationId));
  const origins = new Set(rows.filter(r => r.profileId === profile.id).flatMap(r => r.levels.filter(l => l.locationId !== locationId).map(l => l.locationId)));
  const candidates = existing.length ? existing : groups.filter((g: any) => g.locationGroup.locations.nodes.some((l: any) => origins.has(l.id)));
  if (candidates.length !== 1) throw new Error("DELIVERY_GROUP_AMBIGUOUS");
  const group = candidates[0]; const zones = complete(group.locationGroupZones);
  if (!zones.length || zones.some(z => !z.methodDefinitions.nodes.some((m: any) => m.active && m.rateProvider?.carrierService?.id !== carrierId))) throw new Error("NATIONWIDE_METHOD_MISSING");
  const missing = zones.filter(z => {
    const matches = z.methodDefinitions.nodes.filter((m: any) => m.rateProvider?.carrierService?.id === carrierId);
    if (matches.length > 1 || (matches.length === 1 && !matches[0].active)) throw new Error("CARRIER_METHOD_REQUIRES_REVIEW");
    return matches.length === 0;
  });
  const update = { id: group.locationGroup.id,
    ...(existing.length ? {} : { locationsToAdd: [locationId] }),
    ...(missing.length ? { zonesToUpdate: missing.map(z => ({ id: z.zone.id, methodDefinitionsToCreate: [{ name: "HairGrab Same-Day Delivery", active: true,
      participant: { carrierServiceId: carrierId, adaptToNewServices: true, fixedFee: { amount: 0, currencyCode: "USD" }, percentageOfRateFee: 0 } }] })) } : {}) };
  return { ready: existing.length === 1 && missing.length === 0, baseline: rateFingerprint(profile, carrierId),
    variables: { id: profile.id, profile: { locationGroupsToUpdate: [update] } } };
}
export function configurationGates(admin: AdminClient, scheduler: ShopifyScheduler, ownership: (sellerId: string) => Promise<Ownership[]>) {
  // Per seller cache is only an optimization; delivery re-reads inventory before writes.
  const inventory: ProvisioningContext["inventory"] = async (s, checkpoint) => {
    const rows = await readSellerInventory(s.id, await ownership(s.id), admin, scheduler);
    const plan = planInventory(rows, s.shopifyFulfillmentLocationId!); await checkpoint(plan.fingerprint);
    return plan;
  };
  const deliveryCore: ProvisioningContext["delivery"] = async (s, journal, mutate, baseline) => {
    const rows = await readSellerInventory(s.id, await ownership(s.id), admin, scheduler);
    if (!planInventory(rows, s.shopifyFulfillmentLocationId!).ready) throw new Error("INVENTORY_CHANGED");
    const carriers = complete((await scheduler.request(admin, CARRIER_QUERY)).carrierServices).filter(c => c.name === "HairGrab Same-Day Delivery");
    if (carriers.length !== 1 || carriers[0].callbackUrl !== "https://seller.hairgrab.com/carrier-service" || carriers[0].supportsServiceDiscovery) throw new Error("CARRIER_CONFIGURATION_REQUIRED");
    const carrier = carriers[0]; // Inactive registration is allowed before the final activation gate.
    const profileIds = [...new Set(rows.map(r => r.profileId))].sort();
    // Pending profile is processed first after a restart; never overwrite its intent.
    profileIds.sort((a, b) => Number(b === journal.pending?.target) - Number(a === journal.pending?.target));
    for (const id of profileIds) {
      const read = async () => (await scheduler.request(admin, DELIVERY_QUERY, { id })).deliveryProfile;
      const profile = await read(); const plan = planDelivery(profile, rows, s.shopifyFulfillmentLocationId!, carrier.id);
      const previous = journal.fingerprints.delivery?.[id];
      if (journal.pending?.target === id && previous !== plan.baseline) throw new Error("DELIVERY_BASELINE_CHANGED");
      if (journal.pending?.target !== id) await baseline(id, plan.baseline);
      const hash = journal.pending?.target === id ? journal.pending.fingerprint : fingerprint(plan.variables);
      await mutate("DELIVERY_UPDATE", id, hash, async () => {
        if (rateFingerprint(await read(), carrier.id) !== plan.baseline) throw new Error("DELIVERY_BASELINE_CHANGED");
        await scheduler.request(admin, DELIVERY_UPDATE, plan.variables, true);
      }, async () => {
        const current = planDelivery(await read(), rows, s.shopifyFulfillmentLocationId!, carrier.id);
        if (current.baseline !== plan.baseline) throw new Error("NATIONWIDE_CONFIGURATION_CHANGED");
        return current.ready;
      });
    }
    return { ready: true };
  };
  let deliveryTail: Promise<unknown> = Promise.resolve();
  const delivery: ProvisioningContext["delivery"] = async (...args) => {
    const previous = deliveryTail; let release!: () => void;
    deliveryTail = new Promise<void>(r => { release = r; }); await previous;
    try { return await deliveryCore(...args); } finally { release(); }
  };
  return { inventory, delivery };
}
