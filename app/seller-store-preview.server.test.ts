import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-ignore Node strip-types imports
import { sellerIsOpenAt } from "./store-hours.server.ts";

// Executes the real seller.store-preview.tsx loader AND default component
// together, with in-memory data and no database/Shopify dependency. Proves
// two things the Seller Storefront Parity fix depends on:
//   1. the loader computes storeIsOpen via the SAME sellerIsOpenAt() used by
//      checkout-quote/dispatch enforcement (not a re-implemented ternary);
//   2. the component renders the fulfillment badges, status, and the
//      seller-only "Hidden from shoppers" indicator from that data.
function loadPreviewRoute() {
  const output = ts.transpileModule(
    readFileSync(new URL("./routes/seller.store-preview.tsx", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } },
  ).outputText;

  let currentLoaderData: unknown = null;

  const exports: Record<string, any> = {};
  const context = createContext({
    exports, console, Date, Response, Request, React,
    require: (name: string) => {
      // A getter, not a plain value: `require("../db.server")` runs once at
      // module load (inside the transpiled import), but each `run()` call
      // below swaps in a fresh stub - the getter re-reads it on every use.
      if (name === "../db.server") return { __esModule: true, get default() { return (context as any).__db; } };
      if (name === "../shopify.server") return { __esModule: true, unauthenticated: { admin: () => { throw new Error("Unexpected Shopify call"); } } };
      if (name === "../seller-session.server") return { __esModule: true, requireSellerSession: async () => ({ seller: (context as any).__seller }) };
      if (name === "../store-hours.server.ts") return { __esModule: true, sellerIsOpenAt };
      if (name === "react-router") return {
        __esModule: true,
        Link: (props: any) => React.createElement("a", { href: props.to }, props.children),
        useLoaderData: () => currentLoaderData,
      };
      throw new Error(`Unexpected external dependency: ${name}`);
    },
  });
  runInContext(output, context);

  return {
    // Runs the real loader with the given seller/storeHours fixtures, then
    // renders the real default component from the loader's own output -
    // proving the whole path end to end, not a hand-built fixture.
    async run(seller: Record<string, unknown>, storeHours: Record<string, unknown>[] = []) {
      (context as any).__seller = seller;
      (context as any).__db = {
        sellerProduct: { findMany: async () => [] },
        sellerHomepagePick: { findMany: async () => [] },
        sellerStoreCollection: { findMany: async () => [] },
        sellerStoreMedia: { findMany: async () => [] },
        sellerStoreHour: { findMany: async () => storeHours },
        sellerReview: { findMany: async () => [] },
        productReview: { findMany: async () => [] },
        session: { findFirst: async () => null },
      };
      const data = await exports.loader({ request: new Request("https://seller.hairgrab.com/seller/store-preview") });
      currentLoaderData = data;
      const html = renderToStaticMarkup(React.createElement(exports.default));
      return { data, html };
    },
  };
}

const baseSeller = {
  id: "seller-a",
  businessName: "Test Seller",
  sellerCode: "HG-0001",
  storeDescription: "A great store.",
  logoUrl: "https://cdn.hairgrab.com/logo.png",
  bannerUrl: "https://cdn.hairgrab.com/banner.png",
  businessPositioning: [],
  city: "New York",
  state: "NY",
  sellsNationwide: false,
  offersLocalPickup: false,
  offersLocalDelivery: false,
  offersSameDayDelivery: false,
  returnPolicy: "14_DAY_RETURNS",
  showFeaturedCollection: true,
  showNewArrivalsCollection: true,
  showOnSaleCollection: true,
  showCustomCollections: true,
  showGallery: true,
  showReviews: true,
  useStoreHours: true,
  showStoreHours: true,
  showStoreStatus: true,
  storeOpenOverride: "AUTO",
  timezone: "America/New_York",
  storefrontPublished: true,
};

const day = (dayOfWeek: number, openTime: string | null, closeTime: string | null, isClosed = false) =>
  ({ dayOfWeek, openTime, closeTime, isClosed });

// Open essentially the entire day on every weekday, every day of the week,
// so the assertion holds regardless of when this suite happens to run.
const ALWAYS_OPEN_HOURS = [0, 1, 2, 3, 4, 5, 6].map((d) => day(d, "00:01", "23:58"));
const ALWAYS_CLOSED_HOURS = [0, 1, 2, 3, 4, 5, 6].map((d) => day(d, null, null, true));

test("AUTO + an open weekly schedule renders Open, computed via the real sellerIsOpenAt()", async () => {
  const { run } = loadPreviewRoute();
  const { data, html } = await run(baseSeller, ALWAYS_OPEN_HOURS);
  assert.equal(data.seller.storeIsOpen, sellerIsOpenAt(baseSeller, ALWAYS_OPEN_HOURS));
  assert.equal(data.seller.storeIsOpen, true);
  assert.match(html, />Open</);
  assert.doesNotMatch(html, />Closed</);
});

test("AUTO + a fully closed weekly schedule renders Closed", async () => {
  const { run } = loadPreviewRoute();
  const { data, html } = await run(baseSeller, ALWAYS_CLOSED_HOURS);
  assert.equal(data.seller.storeIsOpen, false);
  assert.match(html, />Closed</);
  assert.doesNotMatch(html, />Open</);
});

test("manual OPEN override renders Open even with a fully closed schedule", async () => {
  const { run } = loadPreviewRoute();
  const seller = { ...baseSeller, storeOpenOverride: "OPEN" };
  const { data, html } = await run(seller, ALWAYS_CLOSED_HOURS);
  assert.equal(data.seller.storeIsOpen, true);
  assert.match(html, />Open</);
});

test("manual CLOSED override renders Closed even with an open schedule", async () => {
  const { run } = loadPreviewRoute();
  const seller = { ...baseSeller, storeOpenOverride: "CLOSED" };
  const { data, html } = await run(seller, ALWAYS_OPEN_HOURS);
  assert.equal(data.seller.storeIsOpen, false);
  assert.match(html, />Closed</);
});

test("showStoreStatus=false hides the status badge entirely, regardless of open/closed", async () => {
  const { run } = loadPreviewRoute();
  // showStoreHours is also off here so the per-day hours table (which
  // legitimately renders the word "Closed" for a closed day) can't be
  // confused with the status badge this test is isolating.
  const seller = { ...baseSeller, showStoreStatus: false, showStoreHours: false, storeOpenOverride: "OPEN" };
  const { html } = await run(seller, ALWAYS_CLOSED_HOURS);
  assert.doesNotMatch(html, />Open</);
  assert.doesNotMatch(html, />Closed</);
});

test("Local Delivery badge renders when enabled, and is absent when disabled", async () => {
  const { run } = loadPreviewRoute();
  const on = await run({ ...baseSeller, offersLocalDelivery: true });
  assert.match(on.html, /Local Delivery/);
  const off = await run({ ...baseSeller, offersLocalDelivery: false });
  assert.doesNotMatch(off.html, /Local Delivery/);
});

test("Same-Day Delivery badge renders when enabled, and is absent when disabled", async () => {
  const { run } = loadPreviewRoute();
  const on = await run({ ...baseSeller, offersSameDayDelivery: true });
  assert.match(on.html, /Same-Day Delivery/);
  const off = await run({ ...baseSeller, offersSameDayDelivery: false });
  assert.doesNotMatch(off.html, /Same-Day Delivery/);
});

test("disabled fulfillment methods are not rendered anywhere in the hero or Store Policies", async () => {
  const { run } = loadPreviewRoute();
  const { html } = await run({
    ...baseSeller,
    sellsNationwide: false,
    offersLocalPickup: false,
    offersLocalDelivery: false,
    offersSameDayDelivery: false,
  });
  assert.doesNotMatch(html, /Ships Nationwide/);
  assert.doesNotMatch(html, /Local Pickup/);
  assert.doesNotMatch(html, /Local Delivery/);
  assert.doesNotMatch(html, /Same-Day Delivery/);
});

test("all four fulfillment methods render together when all are enabled", async () => {
  const { run } = loadPreviewRoute();
  const { html } = await run({
    ...baseSeller,
    sellsNationwide: true,
    offersLocalPickup: true,
    offersLocalDelivery: true,
    offersSameDayDelivery: true,
  });
  assert.match(html, /Ships Nationwide/);
  assert.match(html, /Local Pickup/);
  assert.match(html, /Local Delivery/);
  assert.match(html, /Same-Day Delivery/);
});

test("a hidden storefront still renders fully in preview, with a compact seller-only indicator", async () => {
  const { run } = loadPreviewRoute();
  const hidden = await run({ ...baseSeller, storefrontPublished: false });
  assert.match(hidden.html, /Hidden from shoppers/);

  const live = await run({ ...baseSeller, storefrontPublished: true });
  assert.doesNotMatch(live.html, /Hidden from shoppers/);
});
