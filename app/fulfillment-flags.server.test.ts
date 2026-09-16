import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

// Execute the actual route actions with in-memory persistence/auth boundaries.
// No database, Shopify, or courier requests are made by these regression tests.
function route(filename: string, seller: Record<string, unknown>) {
  const writes: Record<string, any>[] = [];
  const db = {
    seller: { update: async (args: any) => { writes.push(args); return seller; } },
    sellerOnboarding: { update: async () => ({}), findUnique: async () => ({ fulfillmentComplete: false }) },
    sellerLedgerEntry: { findFirst: async () => ({ shopifyOrderName: "#42" }) },
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
      if (name === "../same-day-dispatch-store.server" || name === "../same-day-dispatch.server") return {};
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
  return { writes, action: exports.action, loader: exports.loader };
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

// READY dispatch, reconciliation and cancellation are exercised with SQL persistence
// and mocked HTTP in same-day-dispatch.server.test.ts.
