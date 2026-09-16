import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
// @ts-ignore Node strip-types imports
import { REQUIRED_SAME_DAY_SCOPES, summarizeSameDayFlags, summarizeSameDayReadiness } from "./same-day-shopify.server.ts";

test("REQUIRED_SAME_DAY_SCOPES is the exact set Same-Day provisioning/dispatch need", () => {
  assert.deepEqual(REQUIRED_SAME_DAY_SCOPES, ["write_fulfillments", "write_assigned_fulfillment_orders", "write_shipping", "write_inventory"]);
});

test("summarizeSameDayReadiness reports each required scope's grant status independently", () => {
  const data = { currentAppInstallation: { accessScopes: [{ handle: "write_fulfillments" }, { handle: "write_shipping" }, { handle: "read_orders" }] },
    shop: { features: { marketDrivenShipping: false } } };
  assert.deepEqual(summarizeSameDayReadiness(data), {
    scopes: { write_fulfillments: true, write_assigned_fulfillment_orders: false, write_shipping: true, write_inventory: false },
    marketDrivenShipping: false,
  });
});

test("summarizeSameDayReadiness never returns anything beyond the four scope booleans and the feature flag", () => {
  // A decoy field shaped like something sensitive must never leak through, even if a future
  // SCOPES_QUERY response were extended to include it.
  const data: any = { currentAppInstallation: { accessScopes: [], accessToken: "shpat_should_never_appear" },
    shop: { features: { marketDrivenShipping: true }, id: "gid://shopify/Shop/1" } };
  const result = summarizeSameDayReadiness(data);
  assert.deepEqual(Object.keys(result).sort(), ["marketDrivenShipping", "scopes"]);
  assert.deepEqual(Object.keys(result.scopes).sort(), [...REQUIRED_SAME_DAY_SCOPES].sort());
  assert.equal(JSON.stringify(result).includes("shpat_"), false);
  assert.equal(JSON.stringify(result).includes("Shop/1"), false);
});

test("summarizeSameDayReadiness reports marketDrivenShipping null when the shop feature is absent", () => {
  assert.equal(summarizeSameDayReadiness({}).marketDrivenShipping, null);
});

test("summarizeSameDayFlags returns strict booleans, true only for the literal string \"true\"", () => {
  const flags = summarizeSameDayFlags({
    HAIRGRAB_SAME_DAY_ADMIN_OPERATIONS: "true",
    HAIRGRAB_SAME_DAY_SHOPIFY_WRITES: "TRUE",
    HAIRGRAB_SAME_DAY_LIFECYCLE_READY: undefined,
  });
  assert.deepEqual(flags, { adminOperations: true, shopifyWrites: false, lifecycleReady: false });
  for (const value of Object.values(flags)) assert.equal(typeof value, "boolean");
});

test("summarizeSameDayFlags never echoes back any other env value", () => {
  const flags: any = summarizeSameDayFlags({ HAIRGRAB_SAME_DAY_ADMIN_OPERATIONS: "true", SHOPIFY_API_SECRET: "top-secret" });
  assert.deepEqual(Object.keys(flags).sort(), ["adminOperations", "lifecycleReady", "shopifyWrites"]);
  assert.equal(JSON.stringify(flags).includes("top-secret"), false);
});

test("production provisioning readiness consumes the shared REQUIRED_SAME_DAY_SCOPES constant, not a duplicated literal", async () => {
  const source = await readFile(new URL("./same-day-provisioning-store.server.ts", import.meta.url), "utf8");
  assert.match(source, /REQUIRED_SAME_DAY_SCOPES/, "store must import the shared constant");
  assert.doesNotMatch(source, /\[\s*"write_fulfillments",\s*"write_assigned_fulfillment_orders",\s*"write_shipping",\s*"write_inventory"\s*\]/,
    "store must not keep its own copy of the scope list — that is exactly the drift this route guards against");
});

test("the readiness route is a GET-only loader: no action export, no db import, no mutation query", async () => {
  const source = await readFile(new URL("./routes/app.same-day-readiness.tsx", import.meta.url), "utf8");
  assert.match(source, /export const loader/);
  assert.doesNotMatch(source, /export\s+(const|async function|function)\s+action/, "route must never accept a POST/mutation");
  assert.doesNotMatch(source, /db\.server/, "route must perform zero database reads/writes");
  assert.doesNotMatch(source, /shipday/i, "route must never call Shipday");
  assert.doesNotMatch(source, /mutation Hair/, "route must never issue a Shopify mutation, only SCOPES_QUERY reads");
});
