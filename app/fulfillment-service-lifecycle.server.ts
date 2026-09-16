// @ts-ignore Node strip-types imports
import { ShopifyScheduler, type AdminClient } from "./same-day-shopify.server.ts";
export const FULFILLMENT_ORDER_QUERY = `#graphql
query HairGrabServiceOrder($id: ID!) { fulfillmentOrder(id: $id) {
  id status requestStatus assignedLocation { location { id } } supportedActions { action }
  lineItems(first: 250) { pageInfo { hasNextPage } nodes { id remainingQuantity lineItem { id } } }
  fulfillments(first: 100) { pageInfo { hasNextPage } nodes { id status trackingInfo { url number company }
    fulfillmentLineItems(first: 250) { pageInfo { hasNextPage } nodes { quantity lineItem { id } } }
    events(first: 100) { pageInfo { hasNextPage } nodes { status } }
  } }
} }`;
export const ACCEPT_REQUEST = `#graphql
mutation HairGrabAcceptRequest($id: ID!) { fulfillmentOrderAcceptFulfillmentRequest(id: $id) { fulfillmentOrder { id requestStatus } userErrors { field message } } }`;
export const REJECT_REQUEST = `#graphql
mutation HairGrabRejectRequest($id: ID!) { fulfillmentOrderRejectFulfillmentRequest(id: $id, message: "HairGrab seller cannot currently fulfill this request.") { fulfillmentOrder { id requestStatus } userErrors { field message } } }`;
export const ACCEPT_CANCELLATION = `#graphql
mutation HairGrabAcceptCancellation($id: ID!) { fulfillmentOrderAcceptCancellationRequest(id: $id) { fulfillmentOrder { id requestStatus } userErrors { field message } } }`;
export const REJECT_CANCELLATION = `#graphql
mutation HairGrabRejectCancellation($id: ID!) { fulfillmentOrderRejectCancellationRequest(id: $id, message: "Courier delivery has progressed; contact HairGrab.") { fulfillmentOrder { id requestStatus } userErrors { field message } } }`;
export const CREATE_FULFILLMENT = `#graphql
mutation HairGrabCourierFulfillment($fulfillment: FulfillmentInput!) { fulfillmentCreate(fulfillment: $fulfillment) { fulfillment { id } userErrors { field message } } }`;
export const TRACK_FULFILLMENT = `#graphql
mutation HairGrabCourierTracking($id: ID!, $trackingInfoInput: FulfillmentTrackingInput!) { fulfillmentTrackingInfoUpdate(fulfillmentId: $id, trackingInfoInput: $trackingInfoInput, notifyCustomer: false) { fulfillment { id } userErrors { field message } } }`;
export const DELIVER_FULFILLMENT = `#graphql
mutation HairGrabCourierDelivered($fulfillmentEvent: FulfillmentEventInput!) { fulfillmentEventCreate(fulfillmentEvent: $fulfillmentEvent) { fulfillmentEvent { id status } userErrors { field message } } }`;
export type LifecycleInput = {
  fulfillmentOrderId: string; locationId: string; lineIds: string[]; eligible: boolean;
  quantities: Record<string, number>;
  courierStatus: string | null; courierExists: boolean; trackingUrl: string | null;
};
export type LifecycleJournal = { pending: string | null; fulfillmentId: string | null; updatedAt: string };
/** Does not import Shipday. Assignment/request reconciliation can never dispatch a driver. */
export async function reconcileFulfillmentLifecycle(input: LifecycleInput, admin: AdminClient, scheduler: ShopifyScheduler,
  journal: LifecycleJournal, checkpoint: (next: LifecycleJournal) => Promise<void>, writesAllowed: boolean) {
  let fo: any;
  const read = async () => {
    fo = (await scheduler.request(admin, FULFILLMENT_ORDER_QUERY, { id: input.fulfillmentOrderId })).fulfillmentOrder;
    if (!fo || fo.assignedLocation?.location?.id !== input.locationId || fo.lineItems?.pageInfo?.hasNextPage !== false ||
        fo.fulfillments?.pageInfo?.hasNextPage !== false || !Array.isArray(fo.lineItems.nodes) || !Array.isArray(fo.fulfillments.nodes)) throw new Error("FULFILLMENT_IDENTITY_UNVERIFIED");
    const ids = fo.lineItems.nodes.map((l: any) => l.lineItem.id.split("/").pop());
    if (ids.length !== input.lineIds.length || new Set(ids).size !== ids.length || ids.some((id: string) => !input.lineIds.includes(id))) throw new Error("FULFILLMENT_SELLER_MISMATCH");
    return fo;
  };
  const save = async (pending: string | null, fulfillmentId = journal.fulfillmentId) => {
    const next = { pending, fulfillmentId, updatedAt: new Date().toISOString() }; await checkpoint(next); journal = next;
  };
  const change = async (kind: string, query: string, variables: Record<string, unknown>, verified: () => boolean) => {
    await read();
    if (verified()) { if (journal.pending === kind) await save(null); return; }
    if (journal.pending && journal.pending !== kind) throw new Error("LIFECYCLE_PENDING_RECONCILIATION");
    if (journal.pending) throw new Error("LIFECYCLE_WRITE_UNKNOWN");
    if (!writesAllowed) throw new Error("LIFECYCLE_WRITES_DISABLED");
    await save(kind);
    try { await scheduler.request(admin, query, variables, true); }
    catch { await read(); if (!verified()) throw new Error("LIFECYCLE_WRITE_UNKNOWN"); }
    await read(); if (!verified()) throw new Error("LIFECYCLE_WRITE_UNVERIFIED"); await save(null);
  };
  await read();
  // Resume the exact pending transition before considering a newer transition.
  if (fo.requestStatus === "SUBMITTED" || journal.pending === "ACCEPT_REQUEST" || journal.pending === "REJECT_REQUEST") {
    const accept = journal.pending ? journal.pending === "ACCEPT_REQUEST" : input.eligible;
    await change(accept ? "ACCEPT_REQUEST" : "REJECT_REQUEST", accept ? ACCEPT_REQUEST : REJECT_REQUEST,
      { id: fo.id }, () => fo.requestStatus === (accept ? "ACCEPTED" : "REJECTED"));
  }
  if (fo.requestStatus === "CANCELLATION_REQUESTED" || journal.pending === "ACCEPT_CANCELLATION" || journal.pending === "REJECT_CANCELLATION") {
    // An uncertain/active courier is never implicitly cancelled by a Shopify request.
    const safe = !input.courierExists || input.courierStatus === "CANCELLED";
    const reject = ["PICKEDUP", "DELIVERED"].includes(input.courierStatus || "");
    if (!safe && !reject) return { state: "COURIER_CANCELLATION_REVIEW", dispatchTriggered: false };
    const accept = journal.pending ? journal.pending === "ACCEPT_CANCELLATION" : safe;
    await change(accept ? "ACCEPT_CANCELLATION" : "REJECT_CANCELLATION", accept ? ACCEPT_CANCELLATION : REJECT_CANCELLATION,
      { id: fo.id }, () => fo.requestStatus === (accept ? "CANCELLATION_ACCEPTED" : "CANCELLATION_REJECTED"));
    return { state: fo.requestStatus, dispatchTriggered: false };
  }
  if (!["PICKEDUP", "DELIVERED"].includes(input.courierStatus || "")) return { state: fo.requestStatus, dispatchTriggered: false };
  const fulfillment = () => {
    const matches = fo.fulfillments.nodes.filter((f: any) => f.status !== "CANCELLED");
    if (matches.length > 1) throw new Error("MULTIPLE_FULFILLMENTS_REQUIRE_REVIEW");
    if (matches.length) {
      const lines = matches[0].fulfillmentLineItems;
      if (lines?.pageInfo?.hasNextPage !== false || !Array.isArray(lines.nodes) || lines.nodes.length !== input.lineIds.length ||
          new Set(lines.nodes.map((l: any) => l.lineItem.id)).size !== lines.nodes.length ||
          lines.nodes.some((l: any) => input.quantities[l.lineItem.id.split("/").pop()] !== l.quantity)) throw new Error("FULFILLMENT_QUANTITIES_MISMATCH");
    }
    return matches[0];
  };
  if (!fulfillment() || journal.pending === "CREATE_FULFILLMENT") {
    if (!fulfillment() && fo.lineItems.nodes.some((l: any) => l.remainingQuantity !== input.quantities[l.lineItem.id.split("/").pop()])) throw new Error("FULFILLMENT_QUANTITIES_CHANGED");
    if (!journal.pending && !fo.supportedActions.some((a: any) => a.action === "CREATE_FULFILLMENT")) throw new Error("FULFILLMENT_NOT_CREATABLE");
    await change("CREATE_FULFILLMENT", CREATE_FULFILLMENT, { fulfillment: { notifyCustomer: false,
      lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: fo.id, fulfillmentOrderLineItems: fo.lineItems.nodes.filter((l: any) => l.remainingQuantity > 0).map((l: any) => ({ id: l.id, quantity: l.remainingQuantity })) }] } }, () => !!fulfillment());
  }
  const id = fulfillment().id;
  if (journal.fulfillmentId && journal.fulfillmentId !== id) throw new Error("FULFILLMENT_ID_CHANGED");
  await save(journal.pending, id);
  if (input.trackingUrl) await change("TRACKING", TRACK_FULFILLMENT, { id, trackingInfoInput: { company: "HairGrab Same-Day Delivery", url: input.trackingUrl } },
    () => fulfillment().trackingInfo.some((t: any) => t.url === input.trackingUrl));
  if (input.courierStatus === "DELIVERED") await change("DELIVERED", DELIVER_FULFILLMENT, { fulfillmentEvent: { fulfillmentId: id, status: "DELIVERED" } }, () => {
    const events = fulfillment().events; if (events?.pageInfo?.hasNextPage !== false) throw new Error("FULFILLMENT_EVENTS_INCOMPLETE");
    return events.nodes.some((e: any) => e.status === "DELIVERED");
  });
  return { state: input.courierStatus, dispatchTriggered: false };
}
