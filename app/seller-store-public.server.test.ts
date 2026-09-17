import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-ignore Node strip-types imports
import { sellerIsOpenAt } from "./store-hours.server.ts";

// Executes the real seller-store.$storeSlug.tsx loader AND default component
// together, with an in-memory seller list standing in for
// db.seller.findMany({ where: { status: "ACTIVE", storefrontPublished: true } }).
// The where-clause itself is not reimplemented here (it is not part of this
// checkpoint's diff) - each test supplies exactly the "already-filtered" list
// that query would have returned, which is what the loader actually receives.
function loadPublicRoute() {
  const output = ts.transpileModule(
    readFileSync(new URL("./routes/seller-store.$storeSlug.tsx", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } },
  ).outputText;

  let currentLoaderData: unknown = null;

  const exports: Record<string, any> = {};
  const context = createContext({
    exports, console, Date, Response, Request, React,
    require: (name: string) => {
      if (name === "../db.server") return { __esModule: true, get default() { return (context as any).__db; } };
      if (name === "../shopify.server") return { __esModule: true, unauthenticated: { admin: () => { throw new Error("Unexpected Shopify call"); } } };
      if (name === "../store-hours.server.ts") return { __esModule: true, sellerIsOpenAt };
      if (name === "react-router") return { __esModule: true, useLoaderData: () => currentLoaderData };
      throw new Error(`Unexpected external dependency: ${name}`);
    },
  });
  runInContext(output, context);

  return {
    // Runs the real loader against a given "already-filtered active+published
    // seller list" (see comment above) for a requested slug, then renders the
    // real default component from the loader's own output.
    async run(sellers: Record<string, unknown>[], storeSlug: string, storeHours: Record<string, unknown>[] = []) {
      (context as any).__db = {
        seller: { findMany: async () => sellers },
        sellerProduct: { findMany: async () => [] },
        sellerHomepagePick: { findMany: async () => [] },
        sellerStoreCollection: { findMany: async () => [] },
        sellerStoreMedia: { findMany: async () => [] },
        sellerReview: { findMany: async () => [] },
        sellerStoreHour: { findMany: async () => storeHours },
        session: { findFirst: async () => null },
      };
      const data = await exports.loader({ params: { storeSlug } });
      currentLoaderData = data;
      const html = renderToStaticMarkup(React.createElement(exports.default));
      return { data, html };
    },
    async runExpectingNotFound(sellers: Record<string, unknown>[], storeSlug: string) {
      (context as any).__db = {
        seller: { findMany: async () => sellers },
        sellerProduct: { findMany: async () => [] },
        sellerHomepagePick: { findMany: async () => [] },
        sellerStoreCollection: { findMany: async () => [] },
        sellerStoreMedia: { findMany: async () => [] },
        sellerReview: { findMany: async () => [] },
        sellerStoreHour: { findMany: async () => [] },
        session: { findFirst: async () => null },
      };
      await assert.rejects(
        () => exports.loader({ params: { storeSlug } }),
        (error: unknown) => error instanceof Response && error.status === 404,
      );
    },
  };
}

const baseSeller = {
  id: "seller-a",
  status: "ACTIVE",
  storefrontPublished: true,
  storeSlug: "test-seller",
  businessName: "Test Seller",
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
};

const day = (dayOfWeek: number, openTime: string | null, closeTime: string | null, isClosed = false) =>
  ({ dayOfWeek, openTime, closeTime, isClosed });
const ALWAYS_OPEN_HOURS = [0, 1, 2, 3, 4, 5, 6].map((d) => day(d, "00:01", "23:58"));
const ALWAYS_CLOSED_HOURS = [0, 1, 2, 3, 4, 5, 6].map((d) => day(d, null, null, true));

test("AUTO + an open weekly schedule renders Open, computed via the real sellerIsOpenAt()", async () => {
  const { run } = loadPublicRoute();
  const { data, html } = await run([baseSeller], "test-seller", ALWAYS_OPEN_HOURS);
  assert.equal(data.seller.storeIsOpen, sellerIsOpenAt(baseSeller, ALWAYS_OPEN_HOURS));
  assert.equal(data.seller.storeIsOpen, true);
  assert.match(html, />Open</);
});

test("AUTO + a fully closed weekly schedule renders Closed", async () => {
  const { run } = loadPublicRoute();
  const { data, html } = await run([baseSeller], "test-seller", ALWAYS_CLOSED_HOURS);
  assert.equal(data.seller.storeIsOpen, false);
  assert.match(html, />Closed</);
});

test("manual OPEN override renders Open even with a fully closed schedule", async () => {
  const { run } = loadPublicRoute();
  const seller = { ...baseSeller, storeOpenOverride: "OPEN" };
  const { data, html } = await run([seller], "test-seller", ALWAYS_CLOSED_HOURS);
  assert.equal(data.seller.storeIsOpen, true);
  assert.match(html, />Open</);
});

test("manual CLOSED override renders Closed even with an open schedule", async () => {
  const { run } = loadPublicRoute();
  const seller = { ...baseSeller, storeOpenOverride: "CLOSED" };
  const { data, html } = await run([seller], "test-seller", ALWAYS_OPEN_HOURS);
  assert.equal(data.seller.storeIsOpen, false);
  assert.match(html, />Closed</);
});

test("showStoreStatus=false hides the status badge entirely", async () => {
  const { run } = loadPublicRoute();
  // showStoreHours is also off here so the per-day hours table (which
  // legitimately renders the word "Closed" for a closed day) can't be
  // confused with the status badge this test is isolating.
  const seller = { ...baseSeller, showStoreStatus: false, showStoreHours: false, storeOpenOverride: "OPEN" };
  const { html } = await run([seller], "test-seller", ALWAYS_CLOSED_HOURS);
  assert.doesNotMatch(html, />Open</);
  assert.doesNotMatch(html, />Closed</);
});

test("disabled fulfillment methods are not rendered", async () => {
  const { run } = loadPublicRoute();
  const { html } = await run([{
    ...baseSeller,
    sellsNationwide: false,
    offersLocalPickup: false,
    offersLocalDelivery: false,
    offersSameDayDelivery: false,
  }], "test-seller");
  assert.doesNotMatch(html, /Ships Nationwide/);
  assert.doesNotMatch(html, /Local Pickup/);
  assert.doesNotMatch(html, /Local Delivery/);
  assert.doesNotMatch(html, /Same-Day Delivery/);
});

test("Local Delivery and Same-Day Delivery still render on the public storefront when enabled", async () => {
  const { run } = loadPublicRoute();
  const { html } = await run([{
    ...baseSeller,
    offersLocalDelivery: true,
    offersSameDayDelivery: true,
  }], "test-seller");
  assert.match(html, /Local Delivery/);
  assert.match(html, /Same-Day Delivery/);
});

test("a storeSlug that matches no seller in the active+published list 404s", async () => {
  const { runExpectingNotFound } = loadPublicRoute();
  await runExpectingNotFound([baseSeller], "some-other-slug");
});

test("an empty active+published list (e.g. the seller is hidden or suspended) 404s", async () => {
  const { runExpectingNotFound } = loadPublicRoute();
  await runExpectingNotFound([], "test-seller");
});
