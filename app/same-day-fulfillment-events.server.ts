// @ts-ignore Node strip-types imports
import { type AdminClient, type ShopifyScheduler } from "./same-day-shopify.server.ts";
export const EVENT_ORDER_QUERY = `#graphql
query HairGrabFulfillmentEventIdentity($id: ID!) { fulfillmentOrder(id: $id) {
  id assignedLocation { location { id } } order { id shippingLines(first: 100) { pageInfo { hasNextPage } nodes { code } } }
} }`;
export const SAME_DAY_FULFILLMENT_TOPICS = ["FULFILLMENT_ORDERS_ORDER_ROUTING_COMPLETE", "FULFILLMENT_ORDERS_FULFILLMENT_REQUEST_SUBMITTED", "FULFILLMENT_ORDERS_CANCELLATION_REQUEST_SUBMITTED"];
/** Authenticated event is a hint; identity and shipping choice are re-read from Shopify.
 * This module has no dispatch capability. Nationwide shipping events are untouched. */
export async function reconcileSameDayFulfillmentEvent(topic: string, payload: any, admin: AdminClient, scheduler: ShopifyScheduler,
  sellerAtLocation: (id: string) => Promise<{ id: string } | null>, reconcile: (sellerId: string, orderId: string) => Promise<unknown>) {
  if (!SAME_DAY_FULFILLMENT_TOPICS.includes(topic)) return { ignored: true };
  const id = (topic === "FULFILLMENT_ORDERS_FULFILLMENT_REQUEST_SUBMITTED" ? payload?.submitted_fulfillment_order : payload?.fulfillment_order)?.id;
  if (typeof id !== "string" || !/^gid:\/\/shopify\/FulfillmentOrder\/\d+$/.test(id)) throw new Error("FULFILLMENT_EVENT_INVALID");
  const fo = (await scheduler.request(admin, EVENT_ORDER_QUERY, { id })).fulfillmentOrder;
  if (fo?.id !== id || !fo.assignedLocation?.location?.id || !/^gid:\/\/shopify\/Order\/\d+$/.test(fo.order?.id || "")) throw new Error("FULFILLMENT_EVENT_UNVERIFIED");
  const seller = await sellerAtLocation(fo.assignedLocation.location.id);
  if (!seller) return { ignored: true };
  const shipping = fo.order.shippingLines;
  if (shipping?.pageInfo?.hasNextPage !== false || !Array.isArray(shipping.nodes)) throw new Error("FULFILLMENT_EVENT_INCOMPLETE");
  const matches = shipping.nodes.filter((s: any) => s.code === `hairgrab_same_day_${seller.id}`);
  if (!matches.length) return { ignored: true };
  if (matches.length !== 1) throw new Error("FULFILLMENT_EVENT_AMBIGUOUS");
  await reconcile(seller.id, fo.order.id.split("/").pop());
  return { reconciled: true, dispatchTriggered: false };
}
