import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { DatabaseSync } from "node:sqlite";
// @ts-ignore Node strip-types imports
import { createSameDayProvisioner, provisionSameDaySellerBatch, type ProvisioningStore, type ProvisioningContext } from "./same-day-provisioning.server.ts";
// @ts-ignore Node strip-types imports
import { configurationGates, planInventory, readSellerInventory, planDelivery } from "./same-day-configuration.server.ts";
// @ts-ignore Node strip-types imports
import { ShopifyScheduler } from "./same-day-shopify.server.ts";
// @ts-ignore Node strip-types imports
import { GATES, normalizePickup } from "./same-day-provisioning-state.server.ts";

function fixture(t: TestContext, count = 1) {
  const db = new DatabaseSync(":memory:"); t.after(() => db.close());
  db.exec("CREATE TABLE seller(id TEXT PRIMARY KEY,data TEXT); CREATE TABLE ledger(earnings INTEGER,processingFee INTEGER); INSERT INTO ledger VALUES(5500,125)");
  const ids = Array.from({ length: count }, (_, i) => String(i + 1));
  const services: any[] = []; const calls: any[] = []; let time = Date.parse("2026-09-16T00:00:00Z"); const sleeps: number[] = [];
  const fault = { createUnknown: false, createAbsent: false, readFailures: 0, throttles: 0, storageDown: false, crashAfterCreate: false, rejectSeller: "", inventorySeller: "" };
  for (const id of ids) db.prepare("INSERT INTO seller VALUES(?,?)").run(id, JSON.stringify({ id, sellerCode: `HG-${id}`, businessName: `Seller ${id}`, phone: "+12035550123", address1: "1 Private Main", address2: null, city: "New Haven", state: "CT", postalCode: "06510", country: "US", status: "ACTIVE", offersSameDayDelivery: true,
    shopifyFulfillmentServiceId: null, shopifyFulfillmentLocationId: null, sameDayProvisioningStatus: "NOT_STARTED", sameDayProvisioningError: null, sameDayProvisioningData: null }));
  const get = (id: string) => JSON.parse(String(db.prepare("SELECT data FROM seller WHERE id=?").get(id)?.data));
  const patch = (id: string, data: any) => db.prepare("UPDATE seller SET data=? WHERE id=?").run(JSON.stringify({ ...get(id), ...data }), id);
  const transitions: any[] = [];
  const store: ProvisioningStore = { getSeller: async id => get(id), compareAndSet: async (old, data) => {
    if (fault.storageDown) throw new Error("simulated process loss");
    const changed = db.prepare("UPDATE seller SET data=? WHERE id=? AND data=?").run(JSON.stringify({ ...old, ...data }), old.id, JSON.stringify(old)).changes;
    if (changed) transitions.push({ id: old.id, ...structuredClone(data) }); return changed === 1;
  } };
  const scheduler = new ShopifyScheduler({ now: () => time, sleep: async ms => { sleeps.push(ms); time += ms; }, random: () => 0 });
  const connection = (nodes: any[]) => ({ pageInfo: { hasNextPage: false }, nodes });
  const profile: any = { id: "profile", profileLocationGroups: [{ locationGroup: { id: "shared", locations: connection([{ id: "nationwide" }]) },
    locationGroupZones: connection([{ zone: { id: "us" }, methodDefinitions: connection([{ id: "standard", name: "Standard", active: true, rateProvider: { id: "fixed", price: { amount: "5.00", currencyCode: "USD" } } }]) }]) }] };
  const quantities = (available: number) => ["available", "on_hand", "committed", "reserved", "incoming", "damaged", "safety_stock", "quality_control"].map(name => ({ name, quantity: ["available", "on_hand"].includes(name) ? available : 0 }));
  const admin = { graphql: async (query: string, options?: { variables?: Record<string, any> }) => {
    const v = options?.variables || {}; calls.push({ query, v: structuredClone(v) });
    if (fault.throttles-- > 0) return { status: 429, headers: new Headers({ "Retry-After": "3" }), json: async () => ({ errors: [{ extensions: { code: "THROTTLED" } }] }) };
    if (query.includes("query HairGrabFulfillmentServices") && fault.readFailures-- > 0) throw new Error("temporary network error");
    let data: any;
    if (query.includes("query HairGrabFulfillmentServices")) data = { shop: { fulfillmentServices: structuredClone(services) } };
    else if (query.includes("mutation HairGrabFulfillmentService")) {
      const id = v.name.split("HG-")[1];
      if (id === fault.rejectSeller) return { json: async () => ({ data: { fulfillmentServiceCreate: { userErrors: [{ message: "reject" }] } } }) };
      if (!fault.createAbsent) services.push({ id: `fs-${id}`, serviceName: v.name, inventoryManagement: false, trackingSupport: false, requiresShippingMethod: true, callbackUrl: null,
        location: { id: `loc-${id}`, isActive: true, isFulfillmentService: true, addressVerified: true, address: {} } });
      if (fault.crashAfterCreate) { fault.storageDown = true; throw new Error("process died"); }
      if (fault.createUnknown || fault.createAbsent) throw new Error("response lost");
      data = { fulfillmentServiceCreate: { fulfillmentService: services.at(-1), userErrors: [] } };
    } else if (query.includes("mutation HairGrabLocationEdit")) {
      assert.deepEqual(Object.keys(v.input), ["address"]);
      services.find(s => s.location.id === v.id).location.address = structuredClone(v.input.address);
      data = { locationEdit: { location: { id: v.id }, userErrors: [] } };
    } else if (query.includes("query HairGrabSellerInventory")) {
      const id = v.id.split("/").pop();
      const levels = [{ location: { id: "nationwide" }, quantities: quantities(0) }];
      if (id !== fault.inventorySeller) levels.push({ location: { id: `loc-${id}` }, quantities: quantities(10) });
      data = { product: { id: v.id, variants: { ...connection([{ id: `v-${id}`, deliveryProfile: { id: "profile" }, inventoryItem: { id: `i-${id}`, tracked: true, inventoryLevels: connection(levels) } }]), pageInfo: { hasNextPage: false, endCursor: null } } } };
    } else if (query.includes("query HairGrabCarrierConfiguration")) data = { carrierServices: connection([{ id: "carrier", name: "HairGrab Same-Day Delivery", callbackUrl: "https://seller.hairgrab.com/carrier-service", active: false, supportsServiceDiscovery: false }]) };
    else if (query.includes("query HairGrabDeliveryConfiguration")) data = { deliveryProfile: structuredClone(profile) };
    else if (query.includes("mutation HairGrabDeliveryLocation")) {
      assert.deepEqual(Object.keys(v.profile), ["locationGroupsToUpdate"]);
      const u = v.profile.locationGroupsToUpdate[0];
      assert.equal(u.id, "shared");
      for (const id of u.locationsToAdd || []) profile.profileLocationGroups[0].locationGroup.locations.nodes.push({ id });
      for (const z of u.zonesToUpdate || []) for (const m of z.methodDefinitionsToCreate) profile.profileLocationGroups[0].locationGroupZones.nodes[0].methodDefinitions.nodes.push({ id: "same-day", name: m.name, active: m.active, rateProvider: { carrierService: { id: m.participant.carrierServiceId } } });
      data = { deliveryProfileUpdate: { profile: { id: "profile" }, userErrors: [] } };
    } else throw new Error("unexpected query");
    return { status: 200, json: async () => ({ data }) };
  } };
  const ownership = ids.map(id => ({ sellerId: id, shopifyProductId: `gid://shopify/Product/${id}` }));
  const context: ProvisioningContext = { shop: "hairgrab.myshopify.com", admin, scheduler, writesAllowed: true,
    ownedServiceIds: async () => services.map(s => s.id), ...configurationGates(admin, scheduler, async id => ownership.filter(o => o.sellerId === id)), readiness: async () => true };
  return { db, store, context, services, calls, ids, get, patch, fault, sleeps, profile, transitions, ownership,
    advance: () => { time += 180000; }, engine: () => createSameDayProvisioner(store, () => time) };
}
test("100 sellers: actual gates, ten batches, shared profile, isolated stock and accounting", async t => {
  const x = fixture(t, 100); const before = x.db.prepare("SELECT * FROM ledger").get();
  let active = 0, peak = 0; const started: string[] = []; const completed: string[] = []; const run = x.engine();
  const results = await provisionSameDaySellerBatch(x.ids, x.context, async (...args) => {
    active++; peak = Math.max(peak, active); started.push(args[0]);
    if (Number(args[0]) > 10) assert.ok(completed.includes(String(Math.floor((Number(args[0]) - 1) / 10) * 10)));
    try { return await run(...args); } finally { completed.push(args[0]); active--; }
  }, { batchSize: 10, concurrency: 2 });
  assert.equal(results.filter(r => r.ok).length, 100, JSON.stringify(results.filter(r => !r.ok)));
  assert.equal(peak, 2); assert.equal(started.length, 100); assert.equal(new Set(x.services.map(s => s.id)).size, 100);
  assert.equal(x.profile.profileLocationGroups[0].locationGroup.locations.nodes.length, 101);
  assert.equal(x.profile.profileLocationGroups[0].locationGroupZones.nodes[0].methodDefinitions.nodes.length, 2);
  assert.equal(x.profile.profileLocationGroups[0].locationGroupZones.nodes[0].methodDefinitions.nodes[0].rateProvider.price.amount, "5.00");
  assert.ok(x.calls.every(c => !/inventoryActivate|inventorySet|deliveryProfileCreate/.test(c.query)));
  for (const row of x.transitions.filter(r => r.sameDayProvisioningStatus === "READY")) assert.deepEqual(row.sameDayProvisioningData.completed, [...GATES]);
  assert.deepEqual(x.db.prepare("SELECT * FROM ledger").get(), before);
  assert.equal(JSON.stringify(x.get("1").sameDayProvisioningData).includes("Private"), false);
});
test("100-seller batch isolates invalid, disabled, rejected and allocation-blocked sellers; resumes", async t => {
  const x = fixture(t, 100); x.patch("3", { address1: "" }); x.patch("4", { offersSameDayDelivery: false }); x.fault.rejectSeller = "5"; x.fault.inventorySeller = "6";
  x.fault.throttles = 1; x.fault.readFailures = 2;
  const result = await provisionSameDaySellerBatch(x.ids, x.context, x.engine(), { batchSize: 7, concurrency: 3 });
  assert.equal(result.filter(r => r.ok).length, 96); assert.ok(x.sleeps.includes(3000));
  assert.equal(x.get("6").sameDayProvisioningStatus, "FAILED"); assert.ok(x.get("6").shopifyFulfillmentServiceId);
  const creates = x.calls.filter(c => c.query.includes("mutation HairGrabFulfillmentService")).length;
  x.fault.inventorySeller = ""; assert.equal((await x.engine()("6", x.context)).ok, true);
  assert.equal(x.calls.filter(c => c.query.includes("mutation HairGrabFulfillmentService")).length, creates);
});
test("unknown successful create is reconciled, not repeated", async t => {
  const x = fixture(t); x.fault.createUnknown = true;
  assert.equal((await x.engine()("1", x.context)).ok, true); assert.equal((await x.engine()("1", x.context)).ok, true);
  assert.equal(x.calls.filter(c => c.query.includes("mutation HairGrabFulfillmentService")).length, 1);
});
test("unknown absent create remains blocked across restart", async t => {
  const x = fixture(t); x.fault.createAbsent = true;
  assert.equal((await x.engine()("1", x.context)).ok, false); x.fault.createAbsent = false; x.advance();
  assert.equal((await x.engine()("1", x.context)).reason, "UNKNOWN_WRITE_REQUIRES_REVIEW");
  assert.equal(x.calls.filter(c => c.query.includes("mutation HairGrabFulfillmentService")).length, 1);
});
test("process loss after remote create retains durable intent and resumes using new engine", async t => {
  const x = fixture(t); x.fault.crashAfterCreate = true;
  assert.equal((await x.engine()("1", x.context)).ok, false);
  assert.equal(x.get("1").sameDayProvisioningData.pending.kind, "SERVICE_CREATE");
  x.fault.storageDown = false; x.fault.crashAfterCreate = false; x.advance();
  assert.equal((await x.engine()("1", x.context)).ok, true);
  assert.equal(x.services.length, 1);
});
test("concurrent claims permit one seller operation; existing service/location reused", async t => {
  const x = fixture(t); const results = await Promise.all([x.engine()("1", x.context), x.engine()("1", x.context)]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(x.services.length, 1);
  const id = x.get("1").shopifyFulfillmentLocationId;
  assert.equal((await x.engine()("1", x.context)).ok, true); assert.equal(x.get("1").shopifyFulfillmentLocationId, id);
});
test("duplicates and foreign app service fail only their seller", async t => {
  const x = fixture(t, 2); await x.engine()("1", x.context);
  x.services.push({ ...x.services[0], id: "foreign" });
  assert.equal((await x.engine()("1", x.context)).reason, "AMBIGUOUS_SERVICE_IDENTITY");
  assert.equal((await x.engine()("2", x.context)).ok, true);
  x.services.splice(x.services.findIndex(s => s.id === "foreign"), 1); x.context.ownedServiceIds = async () => [];
  assert.equal((await x.engine()("1", x.context)).reason, "SERVICE_OWNERSHIP_MISMATCH");
});
test("disabling during gate progression fences READY; re-enable keeps identities", async t => {
  const x = fixture(t); const gate = x.context.inventory;
  x.context.inventory = async (...args) => { const r = await gate(...args); x.patch("1", { offersSameDayDelivery: false, sameDayProvisioningStatus: "DISABLED" }); return r; };
  assert.equal((await x.engine()("1", x.context)).ok, false); assert.equal(x.get("1").sameDayProvisioningStatus, "DISABLED");
  x.context.inventory = gate; x.patch("1", { offersSameDayDelivery: true, sameDayProvisioningStatus: "NOT_STARTED" }); x.advance();
  assert.equal((await x.engine()("1", x.context)).ok, true); assert.equal(x.services.length, 1);
});
test("seller inventory cannot cross ownership; activation plan never duplicates stock", async t => {
  const x = fixture(t, 2);
  await assert.rejects(readSellerInventory("1", [...x.ownership, { sellerId: "2", shopifyProductId: "1" }], x.context.admin, x.context.scheduler), /AMBIGUOUS_PRODUCT/);
  assert.equal(x.calls.length, 0);
  const rows = await readSellerInventory("1", x.ownership, x.context.admin, x.context.scheduler);
  const before = structuredClone(rows); const plan = planInventory(rows, "new-location");
  assert.equal(plan.ready, false); assert.equal(plan.items[0].activationRequired, true); assert.deepEqual(rows, before);
});
test("missing lifecycle gate never READY", async t => {
  const x = fixture(t); x.context.readiness = async () => false;
  assert.equal((await x.engine()("1", x.context)).reason, "LIFECYCLE_NOT_READY");
  assert.equal(x.get("1").sameDayProvisioningStatus, "FAILED");
});
test("address normalization rejects unsupported country and malformed pickup", () => {
  const p = { address1: " 1 Main ", address2: null, city: " New Haven ", state: "ct", postalCode: "06510", country: "USA", phone: "203-555-0123" };
  assert.equal(normalizePickup(p).provinceCode, "CT"); assert.equal(normalizePickup(p).phone, "+12035550123");
  assert.throws(() => normalizePickup({ ...p, country: "CA" })); assert.throws(() => normalizePickup({ ...p, state: "unknown" }));
});
