// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { shipdayAmountToCents } from "./shipday.server.ts";

export const SAME_DAY_ORDER_QUERY = `#graphql
  query HairGrabSameDayOrder($id: ID!) {
    order(id: $id) {
      id name displayFinancialStatus cancelledAt currencyCode
      shippingLines(first: 100) { pageInfo { hasNextPage } nodes { code title source discountedPriceSet { shopMoney { amount currencyCode } } } }
      shippingAddress { name phone address1 address2 city provinceCode zip countryCodeV2 }
      lineItems(first: 250) {
        pageInfo { hasNextPage }
        nodes { id title currentQuantity requiresShipping product { id }
          originalUnitPriceSet { shopMoney { amount currencyCode } } }
      }
      fulfillmentOrders(first: 100) {
        pageInfo { hasNextPage }
        nodes { id status requestStatus assignedLocation { location { id } } supportedActions { action } lineItems(first: 250) {
          pageInfo { hasNextPage }
          nodes { id remainingQuantity lineItem { id } }
        } }
      }
    }
  }
`;
export type DispatchOrder = {
  id: string; name: string; paid: boolean; cancelled: boolean; currency: string;
  destination: { name: string; phone: string; address1: string; address2: string;
    city: string; state: string; postalCode: string; country: string } | null;
  lines: { lineId: string; productId: string | null; name: string; quantity: number;
    unitPriceCents: number; blocked: boolean }[];
  shippingLines: { code: string | null; title: string; source: string | null; price: string }[];
  fulfillmentOrders: { id: string; status: string; requestStatus: string; locationId: string; actions: string[];
    lines: { id: string; lineId: string; quantity: number }[] }[];
};
export type DispatchAdmin = { graphql: (query: string, options: { variables: { id: string } }) => Promise<Response> };
const legacyId = (id: string) => id.split("/").pop()!;

export async function readSameDayOrder(admin: DispatchAdmin, id: string): Promise<DispatchOrder> {
  if (!/^\d+$/.test(id)) throw new Error("Invalid order.");
  const response = await admin.graphql(SAME_DAY_ORDER_QUERY, { variables: { id: `gid://shopify/Order/${id}` } });
  const result = await response.json();
  if (!response.ok || result.errors?.length || !result.data?.order) throw new Error("Order unavailable.");
  const order = result.data.order;
  if (order.id !== `gid://shopify/Order/${id}` || order.lineItems?.pageInfo?.hasNextPage !== false ||
      order.fulfillmentOrders?.pageInfo?.hasNextPage !== false || !Array.isArray(order.lineItems.nodes) ||
      !Array.isArray(order.fulfillmentOrders.nodes) || order.shippingLines?.pageInfo?.hasNextPage !== false ||
      !Array.isArray(order.shippingLines.nodes) || order.shippingLines.nodes.some((s: any) => s.discountedPriceSet?.shopMoney?.currencyCode !== "USD")) throw new Error("Order requires manual review.");
  const remaining = new Map<string, { quantity: number; blocked: boolean }>();
  for (const fo of order.fulfillmentOrders.nodes) {
    if (fo.lineItems?.pageInfo?.hasNextPage !== false || !Array.isArray(fo.lineItems.nodes)) throw new Error("Incomplete fulfillment data.");
    for (const item of fo.lineItems.nodes) {
      if (!item.lineItem?.id || !Number.isSafeInteger(item.remainingQuantity) || item.remainingQuantity < 0) throw new Error("Invalid fulfillment quantity.");
      if (!item.remainingQuantity) continue;
      const old = remaining.get(item.lineItem.id) || { quantity: 0, blocked: false };
      remaining.set(item.lineItem.id, { quantity: old.quantity + item.remainingQuantity,
        blocked: old.blocked || !["OPEN", "IN_PROGRESS"].includes(fo.status) });
    }
  }
  const lines: DispatchOrder["lines"] = [];
  for (const line of order.lineItems.nodes) {
    const pending = remaining.get(line.id);
    if (!pending?.quantity || !line.requiresShipping) continue;
    const price = shipdayAmountToCents(line.originalUnitPriceSet?.shopMoney?.amount);
    if (!Number.isSafeInteger(line.currentQuantity) || pending.quantity > line.currentQuantity ||
        price === null || line.originalUnitPriceSet.shopMoney.currencyCode !== "USD") throw new Error("Invalid order quantities or currency.");
    lines.push({ lineId: legacyId(line.id), productId: line.product?.id ?? null, name: line.title,
      quantity: pending.quantity, unitPriceCents: price, blocked: pending.blocked });
  }
  const address = order.shippingAddress;
  return { id, name: order.name, paid: order.displayFinancialStatus === "PAID",
    cancelled: order.cancelledAt !== null, currency: order.currencyCode,
    destination: address ? { name: address.name || "", phone: address.phone || "",
      address1: address.address1 || "", address2: address.address2 || "", city: address.city || "",
      state: address.provinceCode || "", postalCode: address.zip || "", country: address.countryCodeV2 || "" } : null,
    shippingLines: order.shippingLines.nodes.map((s: any) => ({ code: s.code, title: s.title, source: s.source, price: s.discountedPriceSet.shopMoney.amount })),
    fulfillmentOrders: order.fulfillmentOrders.nodes.map((fo: any) => ({ id: fo.id, status: fo.status, requestStatus: fo.requestStatus,
      locationId: fo.assignedLocation?.location?.id || "", actions: (fo.supportedActions || []).map((a: any) => a.action),
      lines: fo.lineItems.nodes.map((l: any) => ({ id: l.id, lineId: legacyId(l.lineItem.id), quantity: l.remainingQuantity })) })),
    lines };
}
