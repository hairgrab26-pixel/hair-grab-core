import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore Node strip-types imports
import { ShopifyScheduler } from "./same-day-shopify.server.ts";
test("shared scheduler serializes reads, observes cost and SDK Retry-After with bounded jitter", async () => {
  let now = 100000, attempts = 0, active = 0, peak = 0;
  const waits: number[] = [], retries: number[] = [];
  const scheduler = new ShopifyScheduler({ now: () => now, random: () => 0.5, sleep: async ms => { waits.push(ms); now += ms; } });
  const admin = { graphql: async () => {
    attempts++; active++; peak = Math.max(peak, active); await Promise.resolve(); active--;
    if (attempts === 1) throw { response: { code: 429, headers: { "retry-after": ["3"] } } };
    return { json: async () => ({ data: { ok: true }, extensions: { cost: { throttleStatus: { currentlyAvailable: 0, restoreRate: 50 } } } }) };
  } };
  await Promise.all(Array.from({ length: 10 }, () => scheduler.request(admin, "read", {}, false, async a => { retries.push(a); })));
  assert.equal(peak, 1); assert.equal(attempts, 11); assert.ok(waits.includes(3125)); assert.ok(waits.includes(2000)); assert.deepEqual(retries, [1]);
});
test("transient reads retry, uncertain writes do not; queued write checks current ownership", async () => {
  const waits: number[] = []; const scheduler = new ShopifyScheduler({ now: Date.now, random: () => 0, sleep: async n => { waits.push(n); } });
  let calls = 0;
  const admin = { graphql: async () => { calls++; throw new Error("network"); } };
  await assert.rejects(scheduler.request(admin, "read"), /READ_RETRIES_EXHAUSTED/);
  assert.equal(calls, 6); assert.deepEqual(waits, [1000, 2000, 4000, 8000, 16000]);
  calls = 0; await assert.rejects(scheduler.request(admin, "write", {}, true), /WRITE_OUTCOME_UNKNOWN/); assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(scheduler.withWriteGuard(async () => { throw new Error("OWNERSHIP_LOST"); }, () => scheduler.request(admin, "write", {}, true)), /OWNERSHIP_LOST/);
  assert.equal(calls, 0);
});
test("known throttled write is retried with an ownership check for every attempt", async () => {
  let calls = 0, checks = 0; const scheduler = new ShopifyScheduler({ now: Date.now, random: () => 0, sleep: async () => {} });
  const admin = { graphql: async () => { calls++; return { status: calls === 1 ? 429 : 200, headers: new Headers({ "Retry-After": "1" }), json: async () => calls === 1 ? {} : { data: { done: true } } }; } };
  await scheduler.withWriteGuard(async () => { checks++; }, () => scheduler.request(admin, "write", {}, true));
  assert.equal(calls, 2); assert.equal(checks, 2);
});
