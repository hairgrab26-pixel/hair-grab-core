import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore Node strip-types imports
import { reconcileFulfillmentLifecycle, type LifecycleInput, type LifecycleJournal } from "./fulfillment-service-lifecycle.server.ts";
// @ts-ignore Node strip-types imports
import { ShopifyScheduler } from "./same-day-shopify.server.ts";
// @ts-ignore Node strip-types imports
import { reconcileSameDayFulfillmentEvent } from "./same-day-fulfillment-events.server.ts";
function fixture() {
  const connection = (nodes: any[]) => ({ pageInfo: { hasNextPage: false }, nodes });
  const fo: any = { id: "fo", status: "OPEN", requestStatus: "SUBMITTED", assignedLocation: { location: { id: "loc" } },
    supportedActions: [{ action: "CREATE_FULFILLMENT" }], lineItems: connection([{ id: "fol", remainingQuantity: 2, lineItem: { id: "gid://shopify/LineItem/1" } }]), fulfillments: connection([]) };
  const input: LifecycleInput = { fulfillmentOrderId: "fo", locationId: "loc", lineIds: ["1"], quantities: { "1": 2 }, eligible: true, courierExists: false, courierStatus: null, trackingUrl: null };
  let journal: LifecycleJournal = { pending: null, fulfillmentId: null, updatedAt: new Date().toISOString() };
  const writes: string[] = []; let unknown = false, absent = false;
  const scheduler = new ShopifyScheduler({ now: Date.now, random: () => 0, sleep: async () => {} });
  const admin = { graphql: async (q: string) => {
    if (q.includes("query ")) return { json: async () => ({ data: { fulfillmentOrder: structuredClone(fo) } }) };
    writes.push(q);
    if (!absent) {
      if (q.includes("HairGrabAcceptRequest")) fo.requestStatus = "ACCEPTED";
      else if (q.includes("HairGrabRejectRequest")) fo.requestStatus = "REJECTED";
      else if (q.includes("HairGrabAcceptCancellation")) fo.requestStatus = "CANCELLATION_ACCEPTED";
      else if (q.includes("HairGrabRejectCancellation")) fo.requestStatus = "CANCELLATION_REJECTED";
      else if (q.includes("HairGrabCourierFulfillment")) { fo.fulfillments.nodes.push({ id: "f", status: "SUCCESS", trackingInfo: [], events: connection([]), fulfillmentLineItems: connection([{ quantity: 2, lineItem: { id: "gid://shopify/LineItem/1" } }]) }); fo.lineItems.nodes[0].remainingQuantity = 0; }
      else if (q.includes("HairGrabCourierTracking")) fo.fulfillments.nodes[0].trackingInfo = [{ url: input.trackingUrl }];
      else if (q.includes("HairGrabCourierDelivered")) fo.fulfillments.nodes[0].events.nodes.push({ status: "DELIVERED" });
      else throw new Error("unexpected mutation");
    }
    if (unknown || absent) throw new Error("connection lost");
    return { json: async () => ({ data: { result: { userErrors: [] } } }) };
  } };
  return { fo, input, writes, get journal() { return journal; }, unknown: () => { unknown = true; }, absent: () => { absent = true; },
    run: () => reconcileFulfillmentLifecycle(input, admin, scheduler, journal, async next => { journal = structuredClone(next); }, true) };
}
test("assignment/request acceptance never creates a courier or fulfillment; ineligible request rejected", async () => {
  const x = fixture(); assert.equal((await x.run()).dispatchTriggered, false);
  assert.equal(x.fo.requestStatus, "ACCEPTED"); assert.equal(x.writes.length, 1); assert.match(x.writes[0], /AcceptRequest/);
  await x.run(); assert.equal(x.writes.length, 1);
  const y = fixture(); y.input.eligible = false; await y.run(); assert.equal(y.fo.requestStatus, "REJECTED");
});
test("pickup creates exact fulfillment; delivered/tracking reconcile once across repeated runs", async () => {
  const x = fixture(); x.input.courierStatus = "PICKEDUP"; x.input.courierExists = true; x.input.trackingUrl = "https://tracking.shipday.com/test";
  await x.run(); assert.equal(x.fo.fulfillments.nodes.length, 1); assert.equal(x.journal.fulfillmentId, "f");
  x.input.courierStatus = "DELIVERED"; await x.run(); await x.run();
  assert.equal(x.writes.length, 4); assert.equal(x.journal.pending, null);
});
test("unknown successful lifecycle writes reconcile; unknown absent writes block on restart", async () => {
  const x = fixture(); x.unknown(); x.input.courierStatus = "DELIVERED"; x.input.courierExists = true;
  await x.run(); await x.run(); assert.equal(x.writes.length, 3);
  const y = fixture(); y.absent(); await assert.rejects(y.run(), /WRITE_UNKNOWN/); await assert.rejects(y.run(), /WRITE_UNKNOWN/);
  assert.equal(y.writes.length, 1); assert.equal(y.journal.pending, "ACCEPT_REQUEST");
});
test("cancellation acceptance, active-driver review and post-pickup rejection stay separate from courier operations", async () => {
  for (const [status, exists, expected] of [[null, false, "CANCELLATION_ACCEPTED"], ["STARTED", true, "COURIER_CANCELLATION_REVIEW"], ["PICKEDUP", true, "CANCELLATION_REJECTED"]] as const) {
    const x = fixture(); x.fo.requestStatus = "CANCELLATION_REQUESTED"; x.input.courierStatus = status; x.input.courierExists = exists;
    const result = await x.run(); assert.equal(result.state, expected); assert.equal(result.dispatchTriggered, false);
  }
});
test("foreign location, foreign items, changed quantity and partial prior fulfillment fail closed", async () => {
  const x = fixture(); x.input.locationId = "other"; await assert.rejects(x.run(), /IDENTITY_UNVERIFIED/); assert.equal(x.writes.length, 0);
  const y = fixture(); y.input.lineIds = ["other"]; await assert.rejects(y.run(), /SELLER_MISMATCH/);
  const z = fixture(); z.fo.requestStatus = "ACCEPTED"; z.input.courierStatus = "PICKEDUP"; z.input.quantities["1"] = 1;
  await assert.rejects(z.run(), /QUANTITIES_CHANGED/); assert.equal(z.writes.length, 0);
  const p = fixture(); p.input.courierStatus = "PICKEDUP"; await p.run(); p.fo.fulfillments.nodes[0].fulfillmentLineItems.nodes[0].quantity = 1;
  await assert.rejects(p.run(), /QUANTITIES_MISMATCH/);
});
test("fulfillment webhook re-reads identity, ignores nationwide and routes independent sellers without dispatch", async () => {
  const scheduler = new ShopifyScheduler(); let code = "standard"; const calls: string[][] = [];
  const admin = { graphql: async () => ({ json: async () => ({ data: { fulfillmentOrder: { id: "gid://shopify/FulfillmentOrder/1", assignedLocation: { location: { id: "loc" } }, order: { id: "gid://shopify/Order/42", shippingLines: { pageInfo: { hasNextPage: false }, nodes: [{ code }] } } } } }) }) };
  const run = (seller: string) => reconcileSameDayFulfillmentEvent("FULFILLMENT_ORDERS_FULFILLMENT_REQUEST_SUBMITTED", { submitted_fulfillment_order: { id: "gid://shopify/FulfillmentOrder/1" } }, admin, scheduler, async () => ({ id: seller }), async (...ids) => { calls.push(ids); });
  assert.deepEqual(await run("a"), { ignored: true }); assert.equal(calls.length, 0);
  for (const id of ["a", "b"]) { code = `hairgrab_same_day_${id}`; assert.equal((await run(id)).dispatchTriggered, false); }
  assert.deepEqual(calls, [["a", "42"], ["b", "42"]]);
});
