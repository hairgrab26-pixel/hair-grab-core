import { createHash, randomUUID } from "node:crypto";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { shipday } from "./shipday.server.ts";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { sameDaySellerEligible, type SameDaySeller } from "./same-day-delivery.server.ts";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { priceSameDayDelivery } from "./delivery-pricing.server.ts";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { parseCourierDispatchData, type CourierDispatchData, type CourierBilling } from "./courier-dispatch-data.server.ts";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import type { DispatchOrder } from "./same-day-order.server.ts";
// @ts-ignore Node strip-types imports
import { sellerProvisioningReady } from "./same-day-provisioning-state.server.ts";
// @ts-ignore Node strip-types imports
import { reconcileSellerOrder } from "./same-day-reconciliation.server.ts";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { sellerIsOpenAt } from "./store-hours.server.ts";

export type CourierRecord = {
  id: string; sellerId: string; shopifyOrderId: string; fulfillmentMethod: string; status: string;
  courierStatus: string | null; courierDeliveryId: string | null; courierProvider: string | null;
  courierFeeCents: number | null; courierDispatchData: unknown; trackingUrl: string | null;
};
export type CourierPatch = Partial<Pick<CourierRecord, "status" | "courierStatus" | "courierDeliveryId" |
  "courierProvider" | "courierFeeCents" | "courierDispatchData" | "trackingUrl">> & {
    readyForPickupAt?: Date; shippedAt?: Date; deliveredAt?: Date; canceledAt?: Date;
  };
export type DispatchStore = {
  get: (sellerId: string, orderId: string) => Promise<CourierRecord | null>;
  seller: (sellerId: string) => Promise<SameDaySeller | null>;
  ownership: (orderId: string) => Promise<{
    sales: { sellerId: string; lineId: string }[];
    products: { sellerId: string; productId: string }[];
  }>;
  // Compare BOTH the prior status/ID and entire snapshot atomically.
  replace: (previous: CourierRecord, patch: CourierPatch) => Promise<boolean>;
};
export type DispatchAction = "ready" | "refresh" | "cancel";
type Result = { success: boolean; message: string };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const address = (v: { address1: string; address2?: string | null; city: string; state: string; postalCode: string; country: string }) =>
  [v.address1, v.address2, v.city, v.state, v.postalCode, v.country].filter(Boolean).join(", ");
const phone = (v: string) => {
  const digits = v.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  throw new Error("A valid US delivery phone number is required.");
};
export function safeCourierTrackingUrl(value: string | null): string | null {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" && !url.username && !url.password &&
      (url.hostname === "shipday.com" || url.hostname.endsWith(".shipday.com")) ? url.href : null;
  } catch { return null; }
}
const remoteStates = ["REQUESTED", "STARTED", "PICKEDUP", "DELIVERED", "CANCELLED", "FAILED"];
const busyStates = ["CREATING", "ASSIGNING", "CANCELING", "ESTIMATING"];
const createdStates = ["CREATED", "CREATED_UNAVAILABLE", "PRE_ASSIGN_FAILED", "ESTIMATING"];
const messageFor = (state: string | null) => ({
  REQUESTED: "Waiting for a driver.", STARTED: "Driver assigned.", PICKEDUP: "Out for delivery.",
  DELIVERED: "Delivered.", CANCELLED: "Delivery cancelled. Provider charges may still apply.",
  FAILED: "Delivery failed. Contact HairGrab before arranging another delivery.",
}[state || ""] || "Dispatch needs reconciliation. Refresh status; do not arrange another driver.");

/** Called only from authenticated seller actions. No webhook invokes dispatch.
 * Single delivery for this seller/order. Uncertain writes never automatically retry.
 */
export function createSameDayDispatcher(store: DispatchStore,
  loadOrder: (orderId: string) => Promise<{ shop: string; order: DispatchOrder }>) {
  return async function run(sellerId: string, orderId: string, action: DispatchAction): Promise<Result> {
    let record: CourierRecord | null = null;
    let snapshot: CourierDispatchData | null = null;
    let ownOperation = false;
    const commit = async (patch: CourierPatch, data: CourierDispatchData | null = snapshot) => {
      if (!record) throw new Error("Missing fulfillment.");
      const next = data ? parseCourierDispatchData({ ...data, operationId: randomUUID(), operationAt: new Date().toISOString() }) : null;
      const update = { ...patch, ...(next ? { courierDispatchData: next } : {}) };
      if (!await store.replace(record, update)) throw new Error("Dispatch changed concurrently.");
      record = { ...record, ...update };
      snapshot = next;
    };
    const saveDetails = async (details: Awaited<ReturnType<typeof shipday.details>>, assignment = false) => {
      if (!record || !snapshot || details.orderId !== record.courierDeliveryId || !remoteStates.includes(details.status)) {
        throw new Error("Delivery identity or status could not be verified.");
      }
      // Do not overwrite known billing amounts with absent fields after cancellation.
      const previous = snapshot.latestBilling;
      const bill: CourierBilling = {
        at: new Date().toISOString(),
        providerCostCents: details.providerCostCents ?? previous?.providerCostCents ?? record.courierFeeCents,
        shipdayChargeCents: details.shipdayChargeCents ?? previous?.shipdayChargeCents ?? null,
        totalBillableAmountCents: details.totalBillableAmountCents ?? previous?.totalBillableAmountCents ?? null,
        processingFeeCents: details.processingFeeCents ?? previous?.processingFeeCents ?? null,
        tipCents: details.tipCents ?? previous?.tipCents ?? null,
        charged: details.charged ?? previous?.charged ?? null,
        billable: details.billable ?? previous?.billable ?? null,
      };
      // A late response must not regress terminal delivery/cancellation state.
      if (["DELIVERED", "CANCELLED"].includes(record.courierStatus || "") && details.status !== record.courierStatus) {
        throw new Error("Conflicting delivery status requires review.");
      }
      const cancelPending = snapshot.cancellationRequestedAt && details.status !== "CANCELLED" && details.status !== "DELIVERED";
      await commit({
        courierStatus: cancelPending ? "CANCEL_PENDING" : details.status,
        status: details.status === "DELIVERED" ? "DELIVERED" : details.status === "CANCELLED" ? "CANCELED" :
          details.status === "PICKEDUP" ? "SHIPPED" : "COURIER_REQUESTED",
        courierProvider: details.provider || record.courierProvider,
        courierFeeCents: bill.providerCostCents,
        trackingUrl: safeCourierTrackingUrl(details.trackingUrl) || record.trackingUrl,
        ...(details.status === "PICKEDUP" && record.status !== "SHIPPED" ? { shippedAt: new Date() } : {}),
        ...(details.status === "DELIVERED" && record.status !== "DELIVERED" ? { deliveredAt: new Date() } : {}),
        ...(details.status === "CANCELLED" && record.status !== "CANCELED" ? { canceledAt: new Date() } : {}),
      }, { ...snapshot, latestBilling: bill, providerCostCents: bill.providerCostCents,
        assignmentBilling: assignment || !snapshot.assignmentBilling ? bill : snapshot.assignmentBilling,
        cancellationBilling: details.status === "CANCELLED" ? bill : snapshot.cancellationBilling });
    };
    try {
      if (!sellerId || !/^\d+$/.test(orderId) || !["ready", "refresh", "cancel"].includes(action)) {
        return { success: false, message: "Invalid delivery request." };
      }
      record = await store.get(sellerId, orderId);
      if (!record || record.sellerId !== sellerId || record.shopifyOrderId !== orderId || record.fulfillmentMethod !== "HAIRGRAB_SAME_DAY") {
        return { success: false, message: "This same-day fulfillment does not belong to your store." };
      }
      const seller = await store.seller(sellerId);
      if (!seller || (action === "ready" && seller.status !== "ACTIVE")) return { success: false, message: "Your store must be active." };
      if (record.courierDispatchData !== null) {
        snapshot = parseCourierDispatchData(record.courierDispatchData);
        if (snapshot.sellerId !== sellerId || snapshot.orderId !== orderId) throw new Error("Snapshot identity mismatch.");
        if (snapshot.externalReference !== `HG${orderId}S${hash([snapshot.shop, sellerId]).slice(0, 32)}`) throw new Error("Invalid external reference.");
      }
      // Legacy remote identities are never treated as a fresh fulfillment.
      if (record.courierDeliveryId && !snapshot) return { success: false, message: "Existing courier delivery requires HairGrab reconciliation." };
      const busy = busyStates.includes(record.courierStatus || "");
      if (busy && snapshot && Date.now() - Date.parse(snapshot.operationAt) < 60_000) {
        return { success: false, message: "A courier request is in progress. Refresh status shortly." };
      }

      if (action === "refresh") {
        if (!snapshot) return { success: true, message: "No driver has been requested. Mark the package READY to dispatch." };
        if (!record.courierDeliveryId) {
          if (!["CREATING", "CREATE_UNCERTAIN"].includes(record.courierStatus || "")) {
            return { success: false, message: "No delivery created. Mark READY to retry availability." };
          }
          const matches = (await shipday.findOrders(snapshot.externalReference)).filter((row) => row.reference === snapshot!.externalReference);
          if (matches.length !== 1) return { success: false, message: "Creation outcome is unresolved. HairGrab must reconcile it before another delivery can be requested." };
          await commit({ courierDeliveryId: String(matches[0].orderId), courierStatus: "CREATED" });
          return { success: true, message: "Shipday order recovered. Mark READY to revalidate and request a driver." };
        }
        await saveDetails(await shipday.details(Number(record.courierDeliveryId)));
        return { success: true, message: messageFor(record.courierStatus) };
      }
      if (action === "cancel") {
        if (!snapshot || !record.courierDeliveryId || busy || createdStates.includes(record.courierStatus || "") ||
            ["ASSIGN_UNCERTAIN", "CREATE_UNCERTAIN"].includes(record.courierStatus || "")) {
          return { success: false, message: "Refresh and reconcile this delivery before cancelling." };
        }
        if (snapshot.cancellationRequestedAt || ["DELIVERED", "CANCELLED", "PICKEDUP"].includes(record.courierStatus || "")) {
          return { success: false, message: "Cancellation cannot be requested again or after pickup. Refresh status or contact HairGrab." };
        }
        await commit({ courierStatus: "CANCELING" }, { ...snapshot, cancellationRequestedAt: new Date().toISOString() });
        ownOperation = true;
        // Reconcile immediately before cancellation; a driver may have picked up.
        const current = await shipday.details(Number(record.courierDeliveryId));
        if (current.orderId !== record.courierDeliveryId || !remoteStates.includes(current.status)) throw new Error("Unexpected delivery identity.");
        if (["PICKEDUP", "DELIVERED", "CANCELLED"].includes(current.status)) {
          if (current.status === "PICKEDUP") await commit({}, { ...snapshot!, cancellationRequestedAt: null });
          await saveDetails(current);
          return { success: false, message: "Delivery progressed; contact HairGrab for cancellation assistance." };
        }
        await shipday.cancel(Number(record.courierDeliveryId));
        await commit({ courierStatus: "CANCEL_PENDING" });
        await saveDetails(await shipday.details(Number(record.courierDeliveryId)));
        return { success: true, message: "Cancellation requested. Provider charges are retained until reconciled; no shopper refund was issued." };
      }

      if (!sameDaySellerEligible(seller) || !sellerProvisioningReady(seller)) return { success: false, message: "Same-Day provisioning must be ready before requesting a driver." };
      // Pre-dispatch gate: a driver is never requested while the store is
      // outside its posted hours (or manually marked closed). Refresh and
      // cancel are unaffected; a seller can always check on or cancel an
      // already-requested delivery regardless of the current time.
      if (!sellerIsOpenAt(seller, seller.storeHours ?? [])) {
        return { success: false, message: "Your store is currently closed. HairGrab will not request a driver outside your posted hours." };
      }
      if (snapshot?.cancellationRequestedAt || ["DELIVERED", "CANCELED", "SHIPPED"].includes(record.status)) {
        return { success: false, message: "This fulfillment cannot request another driver." };
      }
      if (record.courierDeliveryId && !createdStates.includes(record.courierStatus || "")) {
        return { success: false, message: messageFor(record.courierStatus) };
      }
      if (!record.courierDeliveryId && ![null, "WAITING_FOR_DISPATCH", "DISPATCH_FAILED", "DISPATCH_UNAVAILABLE", "QUOTING"].includes(record.courierStatus)) {
        return { success: false, message: "Previous creation needs reconciliation. Refresh status; do not request another driver." };
      }
      if (record.courierStatus === "QUOTING" && snapshot && Date.now() - Date.parse(snapshot.operationAt) < 60_000) {
        return { success: false, message: "Checking courier availability. Please wait." };
      }
      const context = async () => {
        const { shop, order } = await loadOrder(orderId);
        if (!order.paid || order.cancelled || order.currency !== "USD" || order.id !== orderId) throw new Error("Order must be paid, not cancelled, and in USD.");
        const { sales, products } = await store.ownership(orderId);
        if (!sales.some((sale) => sale.sellerId === sellerId)) throw new Error("Order ownership unavailable.");
        const lines: CourierDispatchData["lines"] = [];
        for (const line of order.lines) {
          const owners = new Set(sales.filter((sale) => sale.lineId === line.lineId).map((sale) => sale.sellerId));
          const productOwners = new Set(products.filter((product) => product.productId === line.productId).map((product) => product.sellerId));
          if (owners.size !== 1 || productOwners.size !== 1 || [...owners][0] !== [...productOwners][0]) throw new Error("Ambiguous item ownership.");
          if (!owners.has(sellerId)) continue;
          if (line.blocked) throw new Error("Seller fulfillment is on hold.");
          lines.push({ lineId: line.lineId, quantity: line.quantity, name: line.name, unitPriceCents: line.unitPriceCents });
        }
        if (!lines.length) throw new Error("No fulfillable seller merchandise.");
        const reconciliation = reconcileSellerOrder(order, sellerId, seller.shopifyFulfillmentLocationId!, lines.map(l => l.lineId));
        lines.sort((a, b) => a.lineId.localeCompare(b.lineId));
        const dest = order.destination;
        if (!dest || ![dest.name, dest.address1, dest.city, dest.state, dest.postalCode, dest.phone].every((v) => v.trim()) ||
            dest.country !== "US" || !["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(seller.country.toUpperCase())) throw new Error("Complete US delivery information is required.");
        const pickupAddress = address({ address1: seller.address1!, address2: seller.address2,
          city: seller.city!, state: seller.state!, postalCode: seller.postalCode!, country: "US" });
        const customerAddress = address(dest);
        return { shop, order, lines, reconciliation, pickupAddress, customerAddress, customerPhone: phone(dest.phone), pickupPhone: phone(seller.phone!) };
      };
      const ctx = await context();
      const pickupFingerprint = hash([ctx.pickupAddress, ctx.pickupPhone]);
      const destinationFingerprint = hash([ctx.customerAddress, ctx.customerPhone]);
      const verifyBeforeWrite = async () => {
        const current = await context();
        const currentSeller = await store.seller(sellerId);
        if (!currentSeller || !sameDaySellerEligible(currentSeller) || !sellerProvisioningReady(currentSeller) || current.shop !== ctx.shop ||
            current.reconciliation.fulfillmentOrderId !== ctx.reconciliation.fulfillmentOrderId ||
            current.reconciliation.actualShopifyDeliveryChargeCents !== ctx.reconciliation.actualShopifyDeliveryChargeCents ||
            hash(current.lines) !== hash(ctx.lines) ||
            hash([current.customerAddress, current.customerPhone]) !== destinationFingerprint ||
            hash([address({ address1: currentSeller.address1!, address2: currentSeller.address2, city: currentSeller.city!,
              state: currentSeller.state!, postalCode: currentSeller.postalCode!, country: "US" }), phone(currentSeller.phone!)]) !== pickupFingerprint) {
          throw new Error("Order or pickup changed before dispatch.");
        }
      };
      if (record.courierDeliveryId && (!snapshot || snapshot.shop !== ctx.shop ||
        hash(snapshot.lines) !== hash(ctx.lines) || snapshot.pickupFingerprint !== pickupFingerprint ||
        snapshot.destinationFingerprint !== destinationFingerprint)) {
        return { success: false, message: "Order or pickup details changed. HairGrab must reconcile the existing delivery." };
      }
      const base: CourierDispatchData = snapshot && record.courierDeliveryId ? snapshot : {
        version: 1, operationId: randomUUID(), operationAt: new Date().toISOString(),
        externalReference: `HG${orderId}S${hash([ctx.shop, sellerId]).slice(0, 32)}`,
        shop: ctx.shop, sellerId, orderId, lines: ctx.lines, pickupFingerprint, destinationFingerprint,
        preflightProviderCostCents: null, assignmentEstimateCents: null, intendedShopperChargeCents: null,
        expectedMarginCents: null, pricingPolicyVersion: null, shopifyDeliveryChargeCents: null, currency: "USD",
        actualShopifyDeliveryChargeCents: ctx.reconciliation.actualShopifyDeliveryChargeCents,
        shopperDeliveryChargeCents: ctx.reconciliation.actualShopifyDeliveryChargeCents,
        fulfillmentOrderId: ctx.reconciliation.fulfillmentOrderId,
        cancellationRequestedAt: null, assignmentBilling: null, latestBilling: null, cancellationBilling: null,
      };
      await commit({ courierStatus: record.courierDeliveryId ? "ESTIMATING" : "QUOTING",
        status: "READY_FOR_PICKUP", readyForPickupAt: new Date() }, base);
      ownOperation = true;
      if (!record.courierDeliveryId) {
        const available = (await shipday.availability({ pickupAddress: ctx.pickupAddress, deliveryAddress: ctx.customerAddress }))
          .filter((quote) => quote.available && quote.providerCostCents !== null)
          .sort((a, b) => a.providerCostCents! - b.providerCostCents!)[0];
        if (!available) {
          await commit({ courierStatus: "DISPATCH_UNAVAILABLE" });
          return { success: false, message: "No same-day provider is available. No driver was requested." };
        }
        const pricing = priceSameDayDelivery(available.providerCostCents!);
        await verifyBeforeWrite();
        await commit({ courierStatus: "CREATING" }, { ...snapshot!, preflightProviderCostCents: pricing.providerCostCents,
          providerCostCents: pricing.providerCostCents, expectedHairGrabDeliveryMarginCents: pricing.expectedMarginCents,
          intendedShopperChargeCents: pricing.shopperChargeCents, expectedMarginCents: pricing.expectedMarginCents,
          pricingPolicyVersion: pricing.pricingPolicyVersion });
        // CREATING is durable before the first potentially billable remote write.
        const created = await shipday.insertOrder(sellerId, {
          orderNumber: snapshot!.externalReference, customerName: ctx.order.destination!.name,
          customerAddress: ctx.customerAddress, customerPhoneNumber: ctx.customerPhone,
          restaurantName: seller.businessName, restaurantAddress: ctx.pickupAddress,
          restaurantPhoneNumber: ctx.pickupPhone,
        }, ctx.lines.map((line) => ({ sellerId, name: line.name, quantity: line.quantity, unitPriceCents: line.unitPriceCents })));
        await commit({ courierDeliveryId: String(created.orderId), courierStatus: "CREATED" });
      }
      const estimate = (await shipday.estimate(Number(record.courierDeliveryId)))
        .filter((quote) => quote.available && quote.reference && quote.provider && quote.providerCostCents !== null)
        .sort((a, b) => a.providerCostCents! - b.providerCostCents!)[0];
      if (!estimate) {
        await commit({ courierStatus: "CREATED_UNAVAILABLE" });
        return { success: false, message: "Shipday order saved, but no driver service is available. READY will reuse this order." };
      }
      await verifyBeforeWrite();
      await commit({ courierStatus: "ASSIGNING", courierProvider: estimate.provider },
        { ...snapshot!, assignmentEstimateCents: estimate.providerCostCents });
      const assigned = await shipday.assign({ orderId: Number(record.courierDeliveryId), name: estimate.provider!, estimateReference: estimate.reference! });
      await saveDetails(assigned, true);
      return { success: true, message: messageFor(record.courierStatus) };
    } catch {
      // All messages are static. Never log/return Shopify/Shipday payloads or PII.
      if (ownOperation && record) {
        const state = record.courierStatus;
        const next = state === "CREATING" ? "CREATE_UNCERTAIN" : state === "ASSIGNING" ? "ASSIGN_UNCERTAIN" :
          state === "CANCELING" || state === "CANCEL_PENDING" ? "CANCEL_PENDING" :
          record.courierDeliveryId ? "PRE_ASSIGN_FAILED" : "DISPATCH_FAILED";
        // A stale request cannot overwrite another operation's snapshot/status.
        try { await commit({ courierStatus: next }); } catch { /* Durable prior state blocks duplicates. */ }
      }
      return { success: false, message: ownOperation
        ? "Dispatch could not be confirmed. Refresh status before trying again; HairGrab may need to reconcile the delivery."
        : "Cannot dispatch: verify payment, cancellation, seller ownership, fulfillable items and delivery details. Refresh an existing delivery instead of requesting another." };
    }
  };
}
