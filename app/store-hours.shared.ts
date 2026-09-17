// ==========================================================
// SELLER STORE HOURS — SHARED (CLIENT-SAFE) DATA
//
// Pure, side-effect-free data with no server-only dependencies,
// so it can be imported by both server code (store-hours.server.ts)
// and client-rendered components (e.g. seller.settings.tsx's
// <select name="timezone"> dropdown) without pulling a ".server"
// module into the client bundle. Do not add anything here that
// touches a database, the filesystem, or any other server-only
// resource — that belongs in store-hours.server.ts instead.
// ==========================================================

/** A curated set of IANA zones covering US states/territories HairGrab
 * ships to (see normalizePickup's state list). Both the settings UI
 * dropdown and server-side validation are driven from this single list
 * so a selected value can never fail validation. */
export const SELLER_TIMEZONE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "America/New_York", label: "Eastern Time — New York" },
  { value: "America/Chicago", label: "Central Time — Chicago" },
  { value: "America/Denver", label: "Mountain Time — Denver" },
  { value: "America/Phoenix", label: "Mountain Time (no DST) — Phoenix" },
  { value: "America/Los_Angeles", label: "Pacific Time — Los Angeles" },
  { value: "America/Anchorage", label: "Alaska Time — Anchorage" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (no DST) — Honolulu" },
  { value: "America/Adak", label: "Hawaii-Aleutian Time — Adak" },
  { value: "America/Puerto_Rico", label: "Atlantic Time (no DST) — Puerto Rico / US Virgin Islands" },
  { value: "Pacific/Guam", label: "Chamorro Time (no DST) — Guam / Northern Mariana Islands" },
  { value: "Pacific/Pago_Pago", label: "Samoa Time (no DST) — American Samoa" },
];
