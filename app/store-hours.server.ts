// ==========================================================
// SELLER STORE HOURS ENFORCEMENT
//
// Pure, dependency-free helpers so "is this seller open right
// now" can be unit tested without a database or a mocked clock
// library. SellerStoreHour keeps local HH:MM wall-clock strings
// (see prisma/schema.prisma); Seller.timezone is the IANA
// identifier those strings are interpreted in. Every caller that
// gates a live action (checkout quoting, pre-dispatch) on store
// hours must go through sellerIsOpenAt so DST and overnight
// windows are handled consistently in exactly one place.
// ==========================================================

// @ts-ignore Node's TypeScript stripping requires explicit extensions.
import { SELLER_TIMEZONE_OPTIONS } from "./store-hours.shared.ts";

export { SELLER_TIMEZONE_OPTIONS };

const VALID_TIMEZONES = new Set(SELLER_TIMEZONE_OPTIONS.map((option) => option.value));

export function isValidSellerTimezone(value: unknown): value is string {
  return typeof value === "string" && VALID_TIMEZONES.has(value);
}

export type StoreOpenOverride = "AUTO" | "OPEN" | "CLOSED";

export type StoreHoursSeller = {
  // AUTO follows storeHours (when useStoreHours is on); OPEN/CLOSED are a manual override.
  storeOpenOverride: string;
  useStoreHours: boolean;
  // Nullable IANA identifier. Required by the settings UI whenever store
  // hours can matter, but the type stays nullable to match the database:
  // a seller who never opted into hours enforcement never needed one.
  timezone: string | null;
};

export type StoreHourRow = {
  dayOfWeek: number; // 0 Sunday .. 6 Saturday, matches SellerStoreHour.
  isClosed: boolean;
  openTime: string | null; // "HH:MM" local wall-clock, or null.
  closeTime: string | null; // "HH:MM" local wall-clock, or null.
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function minutesOfDay(value: string): number | null {
  const match = TIME_PATTERN.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Weekday (0 Sun..6 Sat) and minutes-since-midnight for `at`, evaluated in
 * `timeZone`. Intl resolves the correct UTC offset for that exact instant,
 * so this is DST-correct without any manual offset math. */
function localParts(at: Date, timeZone: string): { dayOfWeek: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<string, string>;
  const dayOfWeek = WEEKDAYS.indexOf(map.weekday as (typeof WEEKDAYS)[number]);
  if (dayOfWeek === -1 || !map.hour || !map.minute) throw new Error("INVALID_TIMEZONE");
  // hourCycle h23 can format midnight as "24"; normalize defensively.
  return { dayOfWeek, minutes: (Number(map.hour) % 24) * 60 + Number(map.minute) };
}

/**
 * Is this seller open at `at` (defaults to now)?
 *
 * - storeOpenOverride "OPEN" / "CLOSED" always win: a manual override is
 *   never second-guessed by the weekly schedule.
 * - useStoreHours=false means the seller never opted into hours
 *   enforcement at all: always open, matching pre-existing behavior for
 *   every seller who has not touched the store-hours settings.
 * - Otherwise the seller's local time (from `timezone`) is looked up
 *   against `hours`. A missing timezone, a day with no usable
 *   open/close time, or an unrecognized timezone all fail CLOSED rather
 *   than guessing — same-day dispatch and checkout quoting should never
 *   assume a store is open when its local time cannot be computed.
 * - Overnight windows (close <= open, e.g. 22:00 -> 02:00) are handled
 *   by also checking whether *yesterday's* row spills into this early
 *   morning.
 */
export function sellerIsOpenAt(seller: StoreHoursSeller, hours: readonly StoreHourRow[], at: Date = new Date()): boolean {
  if (seller.storeOpenOverride === "OPEN") return true;
  if (seller.storeOpenOverride === "CLOSED") return false;
  if (!seller.useStoreHours) return true;
  if (!seller.timezone) return false;

  let local: { dayOfWeek: number; minutes: number };
  try {
    local = localParts(at, seller.timezone);
  } catch {
    return false;
  }

  const byDay = new Map(hours.map((hour) => [hour.dayOfWeek, hour]));

  const today = byDay.get(local.dayOfWeek);
  if (today && !today.isClosed) {
    const open = today.openTime ? minutesOfDay(today.openTime) : null;
    const close = today.closeTime ? minutesOfDay(today.closeTime) : null;
    if (open !== null && close !== null && open !== close) {
      if (open < close) {
        if (local.minutes >= open && local.minutes < close) return true;
      } else if (local.minutes >= open) {
        // Overnight window that opened today and runs past midnight.
        return true;
      }
    }
  }

  const yesterday = byDay.get((local.dayOfWeek + 6) % 7);
  if (yesterday && !yesterday.isClosed) {
    const open = yesterday.openTime ? minutesOfDay(yesterday.openTime) : null;
    const close = yesterday.closeTime ? minutesOfDay(yesterday.closeTime) : null;
    // Only an overnight window (open > close) can spill into today; a
    // same-day window never reaches past midnight into the next day.
    if (open !== null && close !== null && open > close && local.minutes < close) return true;
  }

  return false;
}
