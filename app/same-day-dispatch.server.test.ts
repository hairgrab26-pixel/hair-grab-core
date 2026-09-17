import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { DatabaseSync } from "node:sqlite";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { createSameDayDispatcher, type CourierRecord, type DispatchStore } from "./same-day-dispatch.server.ts";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { readSameDayOrder } from "./same-day-order.server.ts";
// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { parseCourierDispatchData } from "./courier-dispatch-data.server.ts";
// @ts-ignore Node strip-types imports
import { readyMapping } from "./same-day-test-fixtures.ts";
// @ts-ignore Node strip-types imports
import { fingerprint, normalizePickup } from "./same-day-provisioning-state.server.ts";

const seller = { id: "seller-a", ...readyMapping("seller-a"), status: "ACTIVE", offersSameDayDelivery: true, businessName: "Seller A",
  address1: "101 Private Pickup Street", address2: "", city: "New York", state: "NY", postalCode: "10005", country: "US", phone: "2125550123" };
const other = { ...seller, ...readyMapping("seller-b"), id: "seller-b", businessName: "Seller B", address1: "303 Other Pickup Street" };
for (const s of [seller, other]) Object.assign(s.sameDayProvisioningData.fingerprints, { pickup: fingerprint(normalizePickup(s)) });
const makeRecord = (sellerId = seller.id): CourierRecord => ({ id: `fulfillment-${sellerId}`, sellerId, shopifyOrderId: "42",
  fulfillmentMethod: "HAIRGRAB_SAME_DAY", status: "READY", courierStatus: null, courierDeliveryId: null,
  courierProvider: null, courierFeeCents: null, courierDispatchData: null, trackingUrl: null });
const gqlOrder = () => ({
  id: "gid://shopify/Order/42", name: "#42", displayFinancialStatus: "PAID", cancelledAt: null as string | null, currencyCode: "USD",
  shippingLines: { pageInfo: { hasNextPage: false }, nodes: ["seller-a", "seller-b"].map(id => ({ code: `hairgrab_same_day_${id}`, title: "HairGrab Same-Day Delivery", source: "app", discountedPriceSet: { shopMoney: { amount: "9.99", currencyCode: "USD" } } })) },
  shippingAddress: { name: "Customer", phone: "2125550456", address1: "202 Customer Street", address2: "Apt 3",
    city: "New York", provinceCode: "NY", zip: "10028", countryCodeV2: "US" },
  lineItems: { pageInfo: { hasNextPage: false }, nodes: [
    { id: "gid://shopify/LineItem/1", title: "Seller A Hair", currentQuantity: 2, requiresShipping: true,
      product: { id: "gid://shopify/Product/11" }, originalUnitPriceSet: { shopMoney: { amount: "19.99", currencyCode: "USD" } } },
    { id: "gid://shopify/LineItem/2", title: "Seller B Hair", currentQuantity: 1, requiresShipping: true,
      product: { id: "gid://shopify/Product/22" }, originalUnitPriceSet: { shopMoney: { amount: "29.99", currencyCode: "USD" } } },
  ] },
  fulfillmentOrders: { pageInfo: { hasNextPage: false }, nodes: [{ id: "fo-a", status: "OPEN", requestStatus: "ACCEPTED", assignedLocation: { location: { id: "loc-seller-a" } }, supportedActions: [{ action: "CREATE_FULFILLMENT" }], lineItems: {
    pageInfo: { hasNextPage: false }, nodes: [
      { id: "fol-a", remainingQuantity: 2, lineItem: { id: "gid://shopify/LineItem/1" } },
    ],
  } }, { id: "fo-b", status: "OPEN", requestStatus: "ACCEPTED", assignedLocation: { location: { id: "loc-seller-b" } }, supportedActions: [{ action: "CREATE_FULFILLMENT" }], lineItems: {
    pageInfo: { hasNextPage: false }, nodes: [{ id: "fol-b", remainingQuantity: 1, lineItem: { id: "gid://shopify/LineItem/2" } }] },
  }] },
});

function setup(t: TestContext) {
  // Real, isolated SQL persistence. No production DB or database mocks.
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE fulfillment (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE seller (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE sale (sellerId TEXT, lineId TEXT, earnings INTEGER);
    CREATE TABLE product (sellerId TEXT, productId TEXT);`);
  for (const item of [seller, other]) {
    db.prepare("INSERT INTO seller VALUES (?, ?)").run(item.id, JSON.stringify(item));
    db.prepare("INSERT INTO fulfillment VALUES (?, ?)").run(`fulfillment-${item.id}`, JSON.stringify(makeRecord(item.id)));
  }
  db.exec(`INSERT INTO sale VALUES ('seller-a','1',3000),('seller-b','2',2500);
    INSERT INTO product VALUES ('seller-a','gid://shopify/Product/11'),('seller-b','gid://shopify/Product/22');`);
  t.after(() => db.close());
  const getRecord = (sellerId = seller.id) => JSON.parse(String(db.prepare("SELECT data FROM fulfillment WHERE id=?").get(`fulfillment-${sellerId}`)!.data)) as CourierRecord;
  const setRecord = (patch: Partial<CourierRecord>, sellerId = seller.id) => db.prepare("UPDATE fulfillment SET data=? WHERE id=?")
    .run(JSON.stringify({ ...getRecord(sellerId), ...patch }), `fulfillment-${sellerId}`);
  const store: DispatchStore = {
    get: async (sellerId, orderId) => {
      const row = db.prepare("SELECT data FROM fulfillment WHERE id=?").get(`fulfillment-${sellerId}`);
      if (!row) return null;
      const value = JSON.parse(String(row.data));
      return value.shopifyOrderId === orderId ? value : null;
    },
    seller: async (id) => {
      const row = db.prepare("SELECT data FROM seller WHERE id=?").get(id);
      return row ? JSON.parse(String(row.data)) : null;
    },
    ownership: async () => ({
      sales: db.prepare("SELECT sellerId,lineId FROM sale").all() as { sellerId: string; lineId: string }[],
      products: db.prepare("SELECT sellerId,productId FROM product").all() as { sellerId: string; productId: string }[],
    }),
    replace: async (old, patch) => Number(db.prepare("UPDATE fulfillment SET data=? WHERE id=? AND data=?")
      .run(JSON.stringify({ ...old, ...patch }), old.id, JSON.stringify(old)).changes) === 1,
  };
  const priorKey = process.env.SHIPDAY_API_KEY;
  process.env.SHIPDAY_API_KEY = "dispatch-http-test-only";
  t.after(() => { if (priorKey === undefined) delete process.env.SHIPDAY_API_KEY; else process.env.SHIPDAY_API_KEY = priorKey; });
  const order = gqlOrder();
  const calls: { path: string; body: any; method: string }[] = [];
  const remoteOrders: { reference: string; id: number }[] = [];
  const remote = { status: "REQUESTED", fee: 749 as number | null, total: 849 as number | null, billable: true, charged: true };
  const fault = { path: "", unavailable: false, estimateUnavailable: false, jsonError: false, afterOrderReads: 0, mismatchedDetails: false };
  let orderReads = 0;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, body, method: init.method || "GET" });
    if (path === "/graphql") {
      orderReads++;
      if (fault.afterOrderReads && orderReads >= fault.afterOrderReads) order.cancelledAt = new Date().toISOString();
      return new Response(JSON.stringify({ data: { order } }));
    }
    if (path === fault.path) throw new Error("Network outcome unknown with private data");
    if (fault.jsonError) return new Response("not-json");
    if (path === "/on-demand/availability" || path.startsWith("/on-demand/estimate/")) {
      const unavailable = fault.unavailable || (fault.estimateUnavailable && path.includes("estimate"));
      return new Response(JSON.stringify(unavailable ? [] : [{ id: "estimate-1", name: "Provider", error: false,
        fee: path.includes("availability") ? 6.49 : 7.49 }]));
    }
    if (path === "/orders") {
      const id = 100 + remoteOrders.length;
      remoteOrders.push({ id, reference: body.orderNumber });
      return new Response(JSON.stringify({ success: true, orderId: id }));
    }
    if (path.startsWith("/orders/")) return new Response(JSON.stringify(remoteOrders.map((row) => ({ orderNumber: row.reference, orderId: row.id }))));
    if (path.includes("/cancel/")) {
      remote.status = "CANCELLED";
      return new Response(JSON.stringify({ success: true }));
    }
    if (path === "/on-demand/assign" || path.includes("/details/")) {
      const orderId = path.endsWith("assign") ? body.orderId : Number(path.split("/").pop());
      return new Response(JSON.stringify({ orderId: fault.mismatchedDetails ? 999 : orderId, status: remote.status, thirdPartyName: "Provider",
        thirdPartyFee: remote.fee === null ? null : remote.fee / 100, shipdayCharge: 1,
        totalBillableAmount: remote.total === null ? null : remote.total / 100,
        charged: remote.charged, billable: remote.billable, trackingUrl: "https://dispatch.shipday.com/tracking/example" }));
    }
    throw new Error(`Unexpected HTTP path ${path}`);
  });
  const run = createSameDayDispatcher(store, async (id) => ({ shop: "hairgrab.myshopify.com",
    order: await readSameDayOrder({ graphql: (query, options) => fetch("https://shopify.test/graphql", {
      method: "POST", body: JSON.stringify({ query, variables: options.variables }),
    }) }, id),
  }));
  return { db, run, order, fault, remote, calls, getRecord, setRecord, remoteOrders,
    shipdayWrites: () => calls.filter((call) => call.method === "POST" && call.path !== "/graphql" && call.path !== "/on-demand/availability") };
}

test("unpaid and cancelled orders never create a delivery", async (t) => {
  const x = setup(t);
  x.order.displayFinancialStatus = "PENDING";
  assert.equal((await x.run(seller.id, "42", "ready")).success, false);
  x.order.displayFinancialStatus = "PAID";
  x.order.cancelledAt = new Date().toISOString();
  assert.equal((await x.run(seller.id, "42", "ready")).success, false);
  assert.equal(x.shipdayWrites().length, 0);
});
test("seller ownership and same-day eligibility are required", async (t) => {
  const x = setup(t);
  assert.equal((await x.run("outsider", "42", "ready")).success, false);
  for (const update of [{ offersSameDayDelivery: false }, { status: "INACTIVE" }, { phone: "" }, { address1: "" }]) {
    x.db.prepare("UPDATE seller SET data=? WHERE id=?").run(JSON.stringify({ ...seller, ...update }), seller.id);
    assert.equal((await x.run(seller.id, "42", "ready")).success, false);
  }
  assert.equal(x.shipdayWrites().length, 0);
});
test("pre-dispatch gate: READY is refused while the store is closed, but refresh/cancel are unaffected", async (t) => {
  const x = setup(t);
  x.db.prepare("UPDATE seller SET data=? WHERE id=?").run(JSON.stringify({ ...seller, storeOpenOverride: "CLOSED" }), seller.id);
  const result = await x.run(seller.id, "42", "ready");
  assert.equal(result.success, false);
  assert.match(result.message, /closed/i);
  assert.equal(x.shipdayWrites().length, 0);
  // refresh/cancel never touch the store-hours gate; they behave exactly as
  // they would for an open store (no snapshot yet, so both short-circuit).
  assert.equal((await x.run(seller.id, "42", "refresh")).success, true);
  assert.equal((await x.run(seller.id, "42", "cancel")).success, false);
  assert.equal(x.shipdayWrites().length, 0);
});
test("pre-dispatch gate: READY is refused outside posted weekly hours, and succeeds once reopened", async (t) => {
  const x = setup(t);
  const closedAllDay = { ...seller, useStoreHours: true, storeOpenOverride: "AUTO", timezone: "America/New_York",
    storeHours: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, isClosed: true, openTime: null, closeTime: null })) };
  x.db.prepare("UPDATE seller SET data=? WHERE id=?").run(JSON.stringify(closedAllDay), seller.id);
  const closed = await x.run(seller.id, "42", "ready");
  assert.equal(closed.success, false);
  assert.match(closed.message, /closed/i);
  assert.equal(x.shipdayWrites().length, 0);
  // Reopen via the seller's manual "Always Open" override so this assertion
  // doesn't depend on which minute of the day the test happens to run in
  // (sellerIsOpenAt's own weekly-window boundary math is covered exhaustively
  // in store-hours.server.test.ts; this test only proves the wiring here).
  const openAllDay = { ...seller, useStoreHours: true, storeOpenOverride: "OPEN", timezone: "America/New_York",
    storeHours: closedAllDay.storeHours };
  x.db.prepare("UPDATE seller SET data=? WHERE id=?").run(JSON.stringify(openAllDay), seller.id);
  const open = await x.run(seller.id, "42", "ready");
  assert.equal(open.success, true, open.message);
});
test("refresh and cancel cannot dispatch; seller READY is required", async (t) => {
  const x = setup(t);
  await x.run(seller.id, "42", "refresh");
  await x.run(seller.id, "42", "cancel");
  assert.equal(x.shipdayWrites().length, 0);
  x.setRecord({ fulfillmentMethod: "LOCAL_PICKUP" });
  assert.equal((await x.run(seller.id, "42", "ready")).success, false);
});
test("READY creates and assigns seller A items with authoritative stored addresses", async (t) => {
  const x = setup(t);
  const result = await x.run(seller.id, "42", "ready");
  assert.equal(result.success, true, result.message);
  const insert = x.calls.find((call) => call.path === "/orders")!.body;
  assert.deepEqual(insert.orderItem, [{ name: "Seller A Hair", quantity: 2, unitPrice: 19.99 }]);
  assert.ok(insert.restaurantAddress.startsWith(seller.address1));
  assert.ok(insert.customerAddress.startsWith(x.order.shippingAddress.address1));
  assert.equal(insert.customerPhoneNumber, "+12125550456");
  const row = x.getRecord();
  assert.equal(row.courierDeliveryId, "100");
  assert.equal(row.courierStatus, "REQUESTED");
  assert.equal(row.courierFeeCents, 749);
  const data = parseCourierDispatchData(row.courierDispatchData);
  assert.equal(data.preflightProviderCostCents, 649);
  assert.equal(data.assignmentEstimateCents, 749);
  assert.equal(data.intendedShopperChargeCents, 999);
  assert.equal(data.expectedMarginCents, 350);
  assert.equal(data.shopifyDeliveryChargeCents, null);
  assert.equal(data.latestBilling!.totalBillableAmountCents, 849);
  assert.equal(x.db.prepare("SELECT SUM(earnings) AS earnings FROM sale").get()!.earnings, 5500);
  assert.equal(JSON.stringify(data).includes(seller.address1), false);
  assert.equal(JSON.stringify(result).includes("Customer Street"), false);
});
test("two sellers create two independent deliveries", async (t) => {
  const x = setup(t);
  await x.run(seller.id, "42", "ready"); await x.run(other.id, "42", "ready");
  const inserts = x.calls.filter((call) => call.path === "/orders");
  assert.equal(inserts.length, 2);
  assert.notEqual(inserts[0].body.orderNumber, inserts[1].body.orderNumber);
  assert.equal(inserts[1].body.orderItem[0].name, "Seller B Hair");
  assert.ok(inserts[1].body.restaurantAddress.startsWith(other.address1));
});
test("concurrent and repeated READY perform one create and one assignment", async (t) => {
  const x = setup(t);
  await Promise.all([x.run(seller.id, "42", "ready"), x.run(seller.id, "42", "ready")]);
  await x.run(seller.id, "42", "ready");
  assert.equal(x.calls.filter((call) => call.path === "/orders").length, 1);
  assert.equal(x.calls.filter((call) => call.path === "/on-demand/assign").length, 1);
});
test("legacy courier ID without a snapshot never creates another delivery", async (t) => {
  const x = setup(t); x.setRecord({ courierDeliveryId: "77" });
  assert.equal((await x.run(seller.id, "42", "ready")).success, false);
  assert.equal(x.shipdayWrites().length, 0);
});
test("ambiguous seller ownership, holds and exhausted quantities fail closed", async (t) => {
  const x = setup(t);
  x.db.exec("UPDATE product SET sellerId='seller-b' WHERE productId='gid://shopify/Product/11'");
  assert.equal((await x.run(seller.id, "42", "ready")).success, false);
  x.db.exec("UPDATE product SET sellerId='seller-a' WHERE productId='gid://shopify/Product/11'");
  x.order.fulfillmentOrders.nodes[0].status = "ON_HOLD";
  assert.equal((await x.run(seller.id, "42", "ready")).success, false);
  x.order.fulfillmentOrders.nodes[0].status = "OPEN";
  x.order.fulfillmentOrders.nodes[0].lineItems.nodes[0].remainingQuantity = 0;
  assert.equal((await x.run(seller.id, "42", "ready")).success, false);
  assert.equal(x.shipdayWrites().length, 0);
});
test("unavailable preflight makes no remote order; later retry is allowed", async (t) => {
  const x = setup(t); x.fault.unavailable = true;
  assert.equal((await x.run(seller.id, "42", "ready")).success, false);
  assert.equal(x.getRecord().courierStatus, "DISPATCH_UNAVAILABLE");
  assert.equal(x.shipdayWrites().length, 0);
  x.fault.unavailable = false;
  assert.equal((await x.run(seller.id, "42", "ready")).success, true);
});
test("create error is uncertain and never blindly retried", async (t) => {
  const x = setup(t); x.fault.path = "/orders";
  await x.run(seller.id, "42", "ready");
  assert.equal(x.getRecord().courierStatus, "CREATE_UNCERTAIN");
  await x.run(seller.id, "42", "refresh");
  await x.run(seller.id, "42", "ready");
  assert.equal(x.calls.filter((call) => call.path === "/orders").length, 1);
});
test("uncertain create recovers deterministic reference without creating again", async (t) => {
  const x = setup(t); x.fault.path = "/orders";
  await x.run(seller.id, "42", "ready");
  const data = parseCourierDispatchData(x.getRecord().courierDispatchData);
  x.remoteOrders.push({ id: 123, reference: data.externalReference });
  x.fault.path = "";
  assert.equal((await x.run(seller.id, "42", "refresh")).success, true);
  assert.equal(x.getRecord().courierDeliveryId, "123");
  assert.equal((await x.run(seller.id, "42", "ready")).success, true);
  assert.equal(x.calls.filter((call) => call.path === "/orders").length, 1);
});
test("assign error retains ID and never repeats create or assign", async (t) => {
  const x = setup(t); x.fault.path = "/on-demand/assign";
  await x.run(seller.id, "42", "ready");
  assert.equal(x.getRecord().courierStatus, "ASSIGN_UNCERTAIN");
  assert.equal(x.getRecord().courierDeliveryId, "100");
  await x.run(seller.id, "42", "ready");
  assert.equal(x.calls.filter((call) => call.path === "/on-demand/assign").length, 1);
  x.fault.path = "";
  await x.run(seller.id, "42", "refresh");
  assert.equal(x.getRecord().courierStatus, "REQUESTED");
});
test("unavailable estimate reuses saved order on next READY", async (t) => {
  const x = setup(t); x.fault.estimateUnavailable = true;
  await x.run(seller.id, "42", "ready");
  assert.equal(x.getRecord().courierStatus, "CREATED_UNAVAILABLE");
  assert.equal(x.getRecord().courierFeeCents, null);
  x.fault.estimateUnavailable = false;
  await x.run(seller.id, "42", "ready");
  assert.equal(x.calls.filter((call) => call.path === "/orders").length, 1);
});
test("order cancellation during dispatch prevents assignment", async (t) => {
  const x = setup(t); x.fault.afterOrderReads = 3;
  await x.run(seller.id, "42", "ready");
  assert.equal(x.calls.filter((call) => call.path === "/on-demand/assign").length, 0);
  assert.equal(x.getRecord().courierStatus, "PRE_ASSIGN_FAILED");
});
test("changed destination after insertion cannot be silently assigned", async (t) => {
  const x = setup(t); x.fault.estimateUnavailable = true;
  await x.run(seller.id, "42", "ready");
  x.order.shippingAddress.address1 = "Changed destination";
  x.fault.estimateUnavailable = false;
  assert.equal((await x.run(seller.id, "42", "ready")).success, false);
  assert.equal(x.calls.filter((call) => call.path === "/on-demand/assign").length, 0);
});
test("cancellation preserves billed cost and does not touch seller earnings", async (t) => {
  const x = setup(t); await x.run(seller.id, "42", "ready");
  x.remote.fee = null; x.remote.total = null;
  assert.equal((await x.run(seller.id, "42", "cancel")).success, true);
  const row = x.getRecord();
  assert.equal(row.courierStatus, "CANCELLED");
  assert.equal(row.courierFeeCents, 749);
  const data = parseCourierDispatchData(row.courierDispatchData);
  assert.equal(data.cancellationBilling!.totalBillableAmountCents, 849);
  assert.equal(data.assignmentBilling!.providerCostCents, 749);
  assert.equal(x.db.prepare("SELECT SUM(earnings) AS earnings FROM sale").get()!.earnings, 5500);
  await x.run(seller.id, "42", "cancel");
  await x.run(seller.id, "42", "ready");
  assert.equal(x.calls.filter((call) => call.path.includes("/cancel/")).length, 1);
  assert.equal(x.calls.filter((call) => call.path === "/orders").length, 1);
});
test("uncertain cancellation is reconciled, never blindly retried", async (t) => {
  const x = setup(t); await x.run(seller.id, "42", "ready");
  x.fault.path = "/on-demand/cancel/100";
  await x.run(seller.id, "42", "cancel"); await x.run(seller.id, "42", "cancel");
  assert.equal(x.getRecord().courierStatus, "CANCEL_PENDING");
  assert.equal(x.calls.filter((call) => call.path.includes("/cancel/")).length, 1);
  x.fault.path = ""; x.remote.status = "CANCELLED";
  await x.run(seller.id, "42", "refresh");
  assert.equal(x.getRecord().courierStatus, "CANCELLED");
});
test("refresh exposes driver, transit and delivered states without ledger writes", async (t) => {
  const x = setup(t); await x.run(seller.id, "42", "ready");
  for (const status of ["STARTED", "PICKEDUP", "DELIVERED"]) {
    x.remote.status = status;
    assert.equal((await x.run(seller.id, "42", "refresh")).success, true);
    assert.equal(x.getRecord().courierStatus, status);
  }
  assert.equal(x.getRecord().trackingUrl, "https://dispatch.shipday.com/tracking/example");
  assert.equal(x.getRecord().status, "DELIVERED");
  assert.equal(x.db.prepare("SELECT SUM(earnings) AS earnings FROM sale").get()!.earnings, 5500);
});
test("invalid snapshot and wrong remote ID fail closed", async (t) => {
  const x = setup(t); x.setRecord({ courierDispatchData: { version: 99 } });
  assert.equal((await x.run(seller.id, "42", "ready")).success, false);
  x.setRecord({ courierDispatchData: null });
  await x.run(seller.id, "42", "ready");
  x.fault.mismatchedDetails = true;
  assert.equal((await x.run(seller.id, "42", "cancel")).success, false);
  assert.equal(x.calls.filter((call) => call.path.includes("/cancel/")).length, 0);
});
test("incomplete Shopify pagination and missing destination fail closed", async (t) => {
  const x = setup(t); x.order.lineItems.pageInfo.hasNextPage = true;
  assert.equal((await x.run(seller.id, "42", "ready")).success, false);
  x.order.lineItems.pageInfo.hasNextPage = false;
  x.order.shippingAddress.address1 = "";
  assert.equal((await x.run(seller.id, "42", "ready")).success, false);
  assert.equal(x.shipdayWrites().length, 0);
});
