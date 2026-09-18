import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

// Execute the actual route actions with in-memory persistence/auth boundaries.
// No database, Shopify, or courier requests are made by these regression tests.
function route(filename: string, seller: Record<string, unknown>, deps: {
  runSellerSameDayAction?: (...args: unknown[]) => Promise<unknown>;
  ownerLookup?: () => Promise<unknown>;
} = {}) {
  const writes: Record<string, any>[] = [];
  const sameDayCalls: unknown[][] = [];
  const runSellerSameDayAction = deps.runSellerSameDayAction ??
    (async () => { throw new Error("Unexpected same-day dispatch call"); });
  const db = {
    seller: { update: async (args: any) => { writes.push(args); return seller; } },
    sellerOnboarding: { update: async () => ({}), findUnique: async () => ({ fulfillmentComplete: false }) },
    sellerLedgerEntry: { findFirst: deps.ownerLookup ?? (async () => ({ shopifyOrderName: "#42" })) },
    sellerOrderFulfillment: {
      create: async (args: any) => { writes.push(args); return args.data; },
      findUnique: async () => null,
      update: async (args: any) => { writes.push(args); return args.data; },
    },
    $transaction: async (promises: Promise<unknown>[]) => Promise.all(promises),
  };
  const output = ts.transpileModule(readFileSync(new URL(`./routes/${filename}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const exports: Record<string, any> = {};
  const context = createContext({ exports, console, Date, Response, Request,
    require: (name: string) => {
      if (name === "@prisma/client") return { Prisma: { DbNull: null } };
      // Route imports only runSellerSameDayAction from this module; the dispatcher
      // itself (same-day-dispatch.server) is exercised separately and never imported here.
      if (name === "../same-day-dispatch-store.server") return {
        runSellerSameDayAction: async (...args: unknown[]) => { sameDayCalls.push(args); return runSellerSameDayAction(...args); },
      };
      if (name === "../same-day-dispatch.server") return {};
      if (name === "react-router") return { redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }) };
      if (name === "../db.server") return { default: db };
      if (name === "../seller-session.server") return { requireSellerSession: async () => ({ seller }) };
      throw new Error(`Unexpected external dependency: ${name}`);
    },
  });
  // Shopify import is unused by these actions, but must fail if invoked.
  context.require = ((original) => (name: string) => name === "../shopify.server"
    ? { unauthenticated: { admin: () => { throw new Error("Unexpected Shopify call"); } } }
    : original(name))(context.require);
  runInContext(output, context);
  return { writes, sameDayCalls, action: exports.action, loader: exports.loader };
}

function request(values: Record<string, string>) {
  return new Request("https://seller.hairgrab.com/seller/orders", {
    method: "POST", body: new URLSearchParams(values),
  });
}

test("onboarding saves Local Delivery and Same-Day independently in all combinations", async () => {
  for (const local of [false, true]) for (const sameDay of [false, true]) {
    const { action, writes, loader } = route("seller.onboarding.fulfillment.tsx", {
      id: "seller-a", offersLocalDelivery: local, offersSameDayDelivery: sameDay,
    });
    const result = await action({ request: request({ nationwideShippingMethod: "SELLER_MANAGED",
      ...(local ? { offersLocalDelivery: "on" } : {}),
      ...(sameDay ? { offersSameDayDelivery: "on" } : {}),
    }) });
    assert.equal(result.status, 302);
    assert.equal(writes[0].data.offersLocalDelivery, local);
    assert.equal(writes[0].data.offersSameDayDelivery, sameDay);
    assert.equal(writes[0].data.nationwideShippingMethod, "SELLER_MANAGED");
    const loaded = await loader({ request: request({}) });
    assert.equal(loaded.seller.offersSameDayDelivery, sameDay);
    assert.equal(loaded.seller.offersLocalDelivery, local);
  }
});

test("order action allows same-day only with its own flag", async () => {
  for (const local of [false, true]) for (const sameDay of [false, true]) {
    const { action, writes } = route("seller.orders.tsx", {
      id: "seller-a", offersLocalDelivery: local, offersSameDayDelivery: sameDay,
    });
    const result = await action({ request: request({ intent: "set-fulfillment-method", orderId: "42", fulfillmentMethod: "HAIRGRAB_SAME_DAY" }) });
    assert.equal(result.success, sameDay);
    assert.equal(writes.length, sameDay ? 1 : 0);
    if (sameDay) assert.equal(writes[0].data.sellerId, "seller-a");
  }
});

// The dispatcher's own payment/ownership/idempotency/duplicate-delivery guarantees are
// exercised with SQL persistence and mocked HTTP in same-day-dispatch.server.test.ts.
// These tests cover only the route wiring in front of it: does seller.orders.tsx route
// each same-day intent to runSellerSameDayAction with the right arguments, and does it
// refuse to call the dispatcher at all when the order isn't this seller's.

test("same-day ready/refresh/cancel intents reach runSellerSameDayAction with the seller, order and mapped action", async () => {
  const cases: Array<[string, "ready" | "refresh" | "cancel"]> = [
    ["ready-for-same-day", "ready"],
    ["refresh-same-day", "refresh"],
    ["cancel-same-day", "cancel"],
  ];
  for (const [intent, mapped] of cases) {
    const { action, sameDayCalls } = route("seller.orders.tsx", { id: "seller-a", offersSameDayDelivery: true }, {
      runSellerSameDayAction: async () => ({ success: true, message: "ok" }),
    });
    const result = await action({ request: request({ intent, orderId: "42" }) });
    assert.deepEqual(sameDayCalls, [["seller-a", "42", mapped]]);
    assert.deepEqual(result, { success: true, message: "ok" });
  }
});

test("a same-day intent for an order that is not this seller's never reaches the dispatcher", async () => {
  const { action, sameDayCalls } = route("seller.orders.tsx", { id: "seller-a", offersSameDayDelivery: true }, {
    ownerLookup: async () => null,
    runSellerSameDayAction: async () => ({ success: true, message: "should not run" }),
  });
  const result = await action({ request: request({ intent: "ready-for-same-day", orderId: "99" }) });
  assert.equal(sameDayCalls.length, 0);
  assert.equal(result.success, false);
  assert.equal(result.message, "This order does not belong to your HairGrab store.");
});

test("a same-day intent without an orderId never reaches the dispatcher", async () => {
  const { action, sameDayCalls } = route("seller.orders.tsx", { id: "seller-a", offersSameDayDelivery: true }, {
    runSellerSameDayAction: async () => ({ success: true, message: "should not run" }),
  });
  const result = await action({ request: request({ intent: "ready-for-same-day" }) });
  assert.equal(sameDayCalls.length, 0);
  assert.equal(result.success, false);
  assert.equal(result.message, "Order was not provided.");
});

test("repeated ready-for-same-day submissions each reach the dispatcher unchanged; idempotency is the dispatcher's own job", async () => {
  const { action, sameDayCalls } = route("seller.orders.tsx", { id: "seller-a", offersSameDayDelivery: true }, {
    runSellerSameDayAction: async () => ({ success: true, message: "ok" }),
  });
  await action({ request: request({ intent: "ready-for-same-day", orderId: "42" }) });
  await action({ request: request({ intent: "ready-for-same-day", orderId: "42" }) });
  assert.deepEqual(sameDayCalls, [["seller-a", "42", "ready"], ["seller-a", "42", "ready"]]);
  // This route never de-duplicates itself — same-day-dispatch.server.test.ts's
  // "concurrent and repeated READY perform one create and one assignment" is what
  // actually proves a second call is safe. This test only proves the route does not
  // short-circuit or swallow a second click before the dispatcher sees it.
});
