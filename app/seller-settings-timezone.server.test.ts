import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
// @ts-ignore Node strip-types imports
import { isValidSellerTimezone, SELLER_TIMEZONE_OPTIONS } from "./store-hours.server.ts";

// Executes the real seller.settings.tsx "saveStorefront" action - specifically
// its conditional Seller.timezone validation - with in-memory persistence and
// no database, Shopify, or file-upload dependency. Mirrors the harness in
// app/fulfillment-flags.server.test.ts. The real store-hours.server.ts
// (isValidSellerTimezone/SELLER_TIMEZONE_OPTIONS) is used rather than a fake,
// so this proves the route's own logic, not a stand-in for it.
function route(seller: Record<string, unknown>) {
  const writes: Record<string, any>[] = [];
  const hourUpserts: Record<string, any>[] = [];
  const db = {
    seller: { update: async (args: any) => { writes.push(args); return { ...seller, ...args.data }; } },
    sellerStoreHour: { upsert: async (args: any) => { hourUpserts.push(args); return args.create; } },
    sellerProduct: { count: async () => 0 },
  };
  const output = ts.transpileModule(readFileSync(new URL("./routes/seller.settings.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const exports: Record<string, any> = {};
  const noop = () => null;
  const context = createContext({
    exports, console, Date, Response, Request, File, FormData, fetch,
    require: (name: string) => {
      // __esModule:true matches what a real TS-compiled module exports, so
      // the transpiled output's __importDefault helper returns these as-is
      // instead of re-wrapping them in another { default: ... } layer.
      if (name === "../db.server") return { __esModule: true, default: db };
      if (name === "../seller-session.server") return { __esModule: true, requireSellerSession: async () => ({ seller }) };
      if (name === "../shopify.server") return { __esModule: true, unauthenticated: { admin: () => { throw new Error("Unexpected Shopify call"); } } };
      if (name === "../store-hours.server.ts") return { __esModule: true, isValidSellerTimezone };
      if (name === "../store-hours.shared.ts") return { __esModule: true, SELLER_TIMEZONE_OPTIONS };
      if (name === "react-router") return { __esModule: true, Form: noop, Link: noop, useActionData: noop, useLoaderData: noop, useNavigation: noop };
      if (name === "react") return { __esModule: true, useEffect: noop, useState: () => [undefined, noop] };
      throw new Error(`Unexpected external dependency: ${name}`);
    },
  });
  runInContext(output, context);
  return { writes, hourUpserts, action: exports.action };
}

function request(values: Record<string, string> = {}) {
  return new Request("https://seller.hairgrab.com/seller/settings", {
    method: "POST",
    body: new URLSearchParams({ intent: "saveStorefront", ...values }),
  });
}

const baseSeller = {
  id: "seller-a", businessName: "Seller A", logoUrl: "https://cdn.hairgrab.com/logo.png",
  bannerUrl: "https://cdn.hairgrab.com/banner.png", offersSameDayDelivery: false,
  storeDescription: "", returnPolicy: "14_DAY_RETURNS",
};

test("store hours disabled + Same-Day disabled + timezone empty: save succeeds, timezone stays null", async () => {
  const { action, writes } = route(baseSeller);
  // alwaysOpen=on -> useStoreHours will be saved false; offersSameDayDelivery omitted -> false.
  const result = await action({ request: request({ alwaysOpen: "on" }) });
  assert.equal(result.success, true, result.message);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].data.timezone, null);
  assert.equal(writes[0].data.useStoreHours, false);
});

test("store hours enabled (Always Open off) + timezone empty: save fails clearly", async () => {
  const { action, writes } = route(baseSeller);
  const result = await action({ request: request({}) }); // alwaysOpen omitted => hours enabled
  assert.equal(result.success, false);
  assert.match(result.message, /time zone/i);
  assert.equal(writes.length, 0);
});

test("Same-Day enabled + timezone empty: save fails clearly, even with Always Open on", async () => {
  const { action, writes } = route(baseSeller);
  const result = await action({ request: request({ alwaysOpen: "on", offersSameDayDelivery: "on" }) });
  assert.equal(result.success, false);
  assert.match(result.message, /time zone/i);
  assert.equal(writes.length, 0);
});

test("an unrecognized timezone value always fails, even when a timezone isn't currently required", async () => {
  const { action, writes } = route(baseSeller);
  const result = await action({ request: request({ alwaysOpen: "on", timezone: "Not/AZone" }) });
  assert.equal(result.success, false);
  assert.match(result.message, /not recognized/i);
  assert.equal(writes.length, 0);
});

test("a valid timezone: save succeeds and the timezone is persisted", async () => {
  const { action, writes } = route(baseSeller);
  const result = await action({ request: request({ timezone: "America/New_York" }) });
  assert.equal(result.success, true, result.message);
  assert.equal(writes[0].data.timezone, "America/New_York");
  assert.equal(writes[0].data.useStoreHours, true); // Always Open was left off.
});

test("Same-Day enabled + a valid timezone: save succeeds even with Always Open on", async () => {
  const { action, writes } = route(baseSeller);
  const result = await action({ request: request({ alwaysOpen: "on", offersSameDayDelivery: "on", timezone: "America/Chicago" }) });
  assert.equal(result.success, true, result.message);
  assert.equal(writes[0].data.timezone, "America/Chicago");
  assert.equal(writes[0].data.offersSameDayDelivery, true);
});

test("nationwide shipping and unrelated storefront settings are unaffected by the timezone gate", async () => {
  const { action, writes } = route(baseSeller);
  const result = await action({ request: request({ alwaysOpen: "on", sellsNationwide: "on", returnPolicy: "FINAL_SALE" }) });
  assert.equal(result.success, true, result.message);
  assert.equal(writes[0].data.sellsNationwide, true);
  assert.equal(writes[0].data.returnPolicy, "FINAL_SALE");
});
