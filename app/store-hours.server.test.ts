import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore Node strip-types imports
import { sellerIsOpenAt, isValidSellerTimezone, SELLER_TIMEZONE_OPTIONS, type StoreHourRow } from "./store-hours.server.ts";

const NY = "America/New_York";
const baseSeller = { storeOpenOverride: "AUTO", useStoreHours: true, timezone: NY };
const day = (dayOfWeek: number, openTime: string | null, closeTime: string | null, isClosed = false): StoreHourRow =>
  ({ dayOfWeek, openTime, closeTime, isClosed });

// 2026-09-16 is a Wednesday. Times below are asserted against America/New_York wall-clock.
const wedLocal = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const utcHour = (h + 4) % 24; // EDT is UTC-4
  return new Date(Date.UTC(2026, 8, 16 + (h + 4 >= 24 ? 1 : 0), utcHour, m));
};

test("manual override always wins over hours and timezone", () => {
  const hours = [day(3, "09:00", "17:00")];
  assert.equal(sellerIsOpenAt({ ...baseSeller, storeOpenOverride: "OPEN" }, [], wedLocal("03:00")), true);
  assert.equal(sellerIsOpenAt({ ...baseSeller, storeOpenOverride: "CLOSED" }, hours, wedLocal("12:00")), false);
  // Even with no timezone at all, OPEN/CLOSED are decided before timezone is consulted.
  assert.equal(sellerIsOpenAt({ storeOpenOverride: "OPEN", useStoreHours: true, timezone: null }, [], new Date()), true);
});

test("a seller who never enabled store hours is always open", () => {
  assert.equal(sellerIsOpenAt({ storeOpenOverride: "AUTO", useStoreHours: false, timezone: null }, [], new Date()), true);
  // Even if rows happen to exist (e.g. left over from a prior config), useStoreHours=false ignores them.
  assert.equal(sellerIsOpenAt({ storeOpenOverride: "AUTO", useStoreHours: false, timezone: NY }, [day(3, "09:00", "10:00")], wedLocal("23:00")), true);
});

test("AUTO with useStoreHours but no timezone fails closed", () => {
  assert.equal(sellerIsOpenAt({ storeOpenOverride: "AUTO", useStoreHours: true, timezone: null }, [day(3, "09:00", "17:00")], wedLocal("12:00")), false);
});

test("AUTO with an unrecognized timezone fails closed instead of throwing", () => {
  assert.equal(sellerIsOpenAt({ ...baseSeller, timezone: "Not/AZone" }, [day(3, "09:00", "17:00")], wedLocal("12:00")), false);
});

test("within a same-day window is open, boundaries and outside are not", () => {
  const hours = [day(3, "09:00", "17:00")];
  assert.equal(sellerIsOpenAt(baseSeller, hours, wedLocal("08:59")), false);
  assert.equal(sellerIsOpenAt(baseSeller, hours, wedLocal("09:00")), true); // open boundary is inclusive
  assert.equal(sellerIsOpenAt(baseSeller, hours, wedLocal("12:30")), true);
  assert.equal(sellerIsOpenAt(baseSeller, hours, wedLocal("16:59")), true);
  assert.equal(sellerIsOpenAt(baseSeller, hours, wedLocal("17:00")), false); // close boundary is exclusive
  assert.equal(sellerIsOpenAt(baseSeller, hours, wedLocal("20:00")), false);
});

test("a day flagged isClosed is closed all day even if times are still stored", () => {
  const hours = [day(3, "09:00", "17:00", true)];
  assert.equal(sellerIsOpenAt(baseSeller, hours, wedLocal("12:00")), false);
});

test("a day with no usable open/close time fails closed rather than guessing", () => {
  assert.equal(sellerIsOpenAt(baseSeller, [day(3, null, null)], wedLocal("12:00")), false);
  assert.equal(sellerIsOpenAt(baseSeller, [day(3, "09:00", null)], wedLocal("12:00")), false);
  assert.equal(sellerIsOpenAt(baseSeller, [day(3, "09:00", "09:00")], wedLocal("09:00")), false); // zero-length window
  assert.equal(sellerIsOpenAt(baseSeller, [], wedLocal("12:00")), false); // no row at all for today
});

test("overnight window spanning midnight is open late tonight and early tomorrow", () => {
  // Wednesday 22:00 -> Thursday 02:00.
  const hours = [day(3, "22:00", "02:00")];
  assert.equal(sellerIsOpenAt(baseSeller, hours, wedLocal("21:59")), false); // before opening
  assert.equal(sellerIsOpenAt(baseSeller, hours, wedLocal("22:00")), true); // opens tonight
  assert.equal(sellerIsOpenAt(baseSeller, hours, wedLocal("23:30")), true);
  // Thursday 00:30 and 01:59 local time are governed by *yesterday's* (Wednesday) row.
  const thuLocal = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return new Date(Date.UTC(2026, 8, 17, (h + 4) % 24, m));
  };
  assert.equal(sellerIsOpenAt(baseSeller, hours, thuLocal("00:30")), true);
  assert.equal(sellerIsOpenAt(baseSeller, hours, thuLocal("01:59")), true);
  assert.equal(sellerIsOpenAt(baseSeller, hours, thuLocal("02:00")), false); // closes at 2am
  assert.equal(sellerIsOpenAt(baseSeller, hours, thuLocal("06:00")), false);
});

test("overnight spillover does not leak into the following day's own hours", () => {
  // Wednesday overnight 22:00->02:00, but Thursday itself is a normal 09:00-17:00 day.
  const hours = [day(3, "22:00", "02:00"), day(4, "09:00", "17:00")];
  const thuLocal = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return new Date(Date.UTC(2026, 8, 17, (h + 4) % 24, m));
  };
  assert.equal(sellerIsOpenAt(baseSeller, hours, thuLocal("05:00")), false); // past the Wed overnight close, before Thu opens
  assert.equal(sellerIsOpenAt(baseSeller, hours, thuLocal("10:00")), true); // Thursday's own hours
});

test("DST transition: the same wall-clock hour is open on both sides of the fall-back change", () => {
  // America/New_York falls back from EDT (UTC-4) to EST (UTC-5) at 2026-11-01 02:00 local.
  const hours = [day(0, "09:00", "17:00"), day(1, "09:00", "17:00")];
  // 2026-10-25 is a Sunday (still EDT, UTC-4): 12:00 local = 16:00 UTC.
  assert.equal(sellerIsOpenAt(baseSeller, hours, new Date("2026-10-25T16:00:00.000Z")), true);
  // 2026-11-08 is a Sunday (now EST, UTC-5): 12:00 local = 17:00 UTC.
  assert.equal(sellerIsOpenAt(baseSeller, hours, new Date("2026-11-08T17:00:00.000Z")), true);
  // Using the pre-transition offset (16:00 UTC) after the transition is 11:00 local, still open,
  // but 20:00 UTC after the transition is 15:00 local (still open) while 22:00 UTC is 17:00 local (closed) -
  // the point is these are computed from real IANA rules, not a fixed manual offset.
  assert.equal(sellerIsOpenAt(baseSeller, hours, new Date("2026-11-08T22:00:00.000Z")), false);
});

test("timezone options are all individually valid, and unknown values are rejected", () => {
  for (const option of SELLER_TIMEZONE_OPTIONS) assert.equal(isValidSellerTimezone(option.value), true);
  assert.equal(isValidSellerTimezone("America/Nowhere"), false);
  assert.equal(isValidSellerTimezone(""), false);
  assert.equal(isValidSellerTimezone(null), false);
  assert.equal(isValidSellerTimezone(undefined), false);
});
