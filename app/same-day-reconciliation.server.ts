export type ReconciliationInput = {
  shippingLines: Array<{ title?: string; code?: string | null; price?: string | number; source?: string | null }>;
  fulfillmentOrders: Array<{ assignedLocationId?: string | null; sellerId?: string; lineItemIds?: string[] }>;
  sellerLocationId: string;
  sellerId: string;
  sameDayServiceCode: string;
};
const cents = (value: unknown) => {
  const text = String(value ?? "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(result) ? result : null;
};
/** Uses Shopify's post-order shipping lines and fulfillment-order location as authority. */
export function reconcileActualShopifyDeliveryCharge(input: ReconciliationInput) {
  const fulfillment = input.fulfillmentOrders.filter((row) => row.assignedLocationId === input.sellerLocationId && row.sellerId === input.sellerId);
  if (fulfillment.length !== 1) return { status: "AMBIGUOUS" as const, actualShopifyDeliveryChargeCents: null };
  // A generic title cannot attribute a charge to one seller in a mixed cart.
  const matches = input.shippingLines.filter((line) => line.code === input.sameDayServiceCode);
  if (matches.length !== 1) return { status: "AMBIGUOUS" as const, actualShopifyDeliveryChargeCents: null };
  const amount = cents(matches[0].price);
  if (amount === null) return { status: "INVALID" as const, actualShopifyDeliveryChargeCents: null };
  return { status: "RECONCILED" as const, actualShopifyDeliveryChargeCents: amount };
}

// @ts-ignore Node strip-types imports
import type { DispatchOrder } from "./same-day-order.server.ts";
export function reconcileSellerOrder(order: DispatchOrder, sellerId: string, locationId: string, lineIds: string[], requireReady = true) {
  const own = new Set(lineIds);
  const intersecting = order.fulfillmentOrders.filter(fo => fo.lines.some(l => l.quantity > 0 && own.has(l.lineId)));
  if (intersecting.length !== 1) throw new Error("AMBIGUOUS_FULFILLMENT_ASSIGNMENT");
  const fo = intersecting[0];
  if (fo.locationId !== locationId || fo.lines.some(l => l.quantity > 0 && !own.has(l.lineId)) ||
      lineIds.some(id => !fo.lines.some(l => l.lineId === id && l.quantity > 0))) throw new Error("SELLER_LOCATION_MISMATCH");
  const result = reconcileActualShopifyDeliveryCharge({ sellerId, sellerLocationId: locationId,
    sameDayServiceCode: `hairgrab_same_day_${sellerId}`, shippingLines: order.shippingLines,
    fulfillmentOrders: [{ sellerId, assignedLocationId: fo.locationId, lineItemIds: lineIds }] });
  if (result.status !== "RECONCILED") throw new Error("AMBIGUOUS_DELIVERY_CHARGE");
  if (requireReady && (!["OPEN", "IN_PROGRESS"].includes(fo.status) || !["ACCEPTED", "UNSUBMITTED"].includes(fo.requestStatus) ||
      !fo.actions.includes("CREATE_FULFILLMENT"))) throw new Error("FULFILLMENT_REQUEST_NOT_READY");
  return { fulfillmentOrderId: fo.id, actualShopifyDeliveryChargeCents: result.actualShopifyDeliveryChargeCents! };
}
