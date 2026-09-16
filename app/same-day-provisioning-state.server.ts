import { createHash } from "node:crypto";
export const GATES = ["eligibility", "service", "location", "address", "inventory", "delivery", "carrier", "lifecycle", "reconciliation"] as const;
export type Gate = typeof GATES[number];
export type ProvisioningJournal = {
  version: 1; shop: string; operationId: string; owner: string | null;
  startedAt: string; updatedAt: string; leaseUntil: string; action: "provision" | "reconcile";
  completed: Gate[]; lastVerifiedStep: Gate | null;
  pending: { kind: "SERVICE_CREATE" | "LOCATION_EDIT" | "DELIVERY_UPDATE"; fingerprint: string; target: string } | null;
  retries: { count: number; nextAttemptAt: string | null };
  fingerprints: { pickup?: string; inventory?: string; delivery?: Record<string, string> };
};
export const fingerprint = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function readProvisioningJournal(value: unknown): ProvisioningJournal | null {
  if (value === null || value === undefined) return null;
  const v = value as ProvisioningJournal;
  const date = (s: unknown) => typeof s === "string" && Number.isFinite(Date.parse(s));
  const keys = (o: unknown, allowed: string[]) => !!o && typeof o === "object" && !Array.isArray(o) && Object.keys(o).every(k => allowed.includes(k));
  const hash = (s: unknown) => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
  if (!keys(v, ["version", "shop", "operationId", "owner", "startedAt", "updatedAt", "leaseUntil", "action", "completed", "lastVerifiedStep", "pending", "retries", "fingerprints"]) ||
      !keys(v.fingerprints, ["pickup", "inventory", "delivery"]) || !keys(v.retries, ["count", "nextAttemptAt"]) ||
      [v.fingerprints.pickup, v.fingerprints.inventory].some(h => h !== undefined && !hash(h)) ||
      (v.fingerprints.delivery !== undefined && (!keys(v.fingerprints.delivery, Object.keys(v.fingerprints.delivery)) || !Object.values(v.fingerprints.delivery).every(hash))) ||
      (v.pending !== null && (!keys(v.pending, ["kind", "fingerprint", "target"]) || typeof v.pending.target !== "string" || !v.pending.target))) throw new Error("INVALID_PROVISIONING_JOURNAL");
  if (!v || v.version !== 1 || typeof v.shop !== "string" || !v.shop.endsWith(".myshopify.com") ||
      typeof v.operationId !== "string" || !v.operationId || !(v.owner === null || typeof v.owner === "string") ||
      ![v.startedAt, v.updatedAt, v.leaseUntil].every(date) || !["provision", "reconcile"].includes(v.action) ||
      !Array.isArray(v.completed) || v.completed.some(g => !GATES.includes(g)) ||
      !(v.lastVerifiedStep === null || GATES.includes(v.lastVerifiedStep)) ||
      !v.retries || !Number.isInteger(v.retries.count) || v.retries.count < 0 || v.retries.count > 5 ||
      !(v.retries.nextAttemptAt === null || date(v.retries.nextAttemptAt)) || !v.fingerprints ||
      !(v.pending === null || (["SERVICE_CREATE", "LOCATION_EDIT", "DELIVERY_UPDATE"].includes(v.pending.kind) && /^[a-f0-9]{64}$/.test(v.pending.fingerprint)))) throw new Error("INVALID_PROVISIONING_JOURNAL");
  return structuredClone(v);
}
export type Pickup = { address1: string; address2: string; city: string; provinceCode: string; zip: string; countryCode: "US"; phone: string };
export function normalizePickup(s: { address1: string | null; address2?: string | null; city: string | null; state: string | null; postalCode: string | null; country: string; phone: string | null }): Pickup {
  const clean = (v: string | null | undefined) => (v || "").trim().replace(/\s+/g, " ");
  const states = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR VI GU AS MP".split(" ");
  const digits = (s.phone || "").replace(/\D/g, "");
  const result: Pickup = { address1: clean(s.address1), address2: clean(s.address2), city: clean(s.city),
    provinceCode: clean(s.state).toUpperCase().replace(/^US-/, ""), zip: clean(s.postalCode), countryCode: "US", phone: digits.length === 10 ? `+1${digits}` : `+${digits}` };
  if (!["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(clean(s.country).toUpperCase()) ||
      !result.address1 || !result.city || !states.includes(result.provinceCode) || !/^\d{5}(-\d{4})?$/.test(result.zip) ||
      !/^\+1\d{10}$/.test(result.phone) || /[^\d\s()+.-]/.test(s.phone || "")) throw new Error("INVALID_US_PICKUP");
  return result;
}
export function pickupMatches(actual: any, wanted: Pickup) {
  if (!actual) return false;
  const clean = (v: unknown) => String(v || "").trim().replace(/\s+/g, " ").toUpperCase();
  return Object.entries(wanted).every(([key, value]) => key === "phone" ? String(actual[key] || "").replace(/\D/g, "") === value.replace(/\D/g, "") : clean(actual[key]) === clean(value));
}
export function sellerProvisioningReady(s: { status: string; offersSameDayDelivery: boolean; sameDayProvisioningStatus?: string; shopifyFulfillmentServiceId?: string | null; shopifyFulfillmentLocationId?: string | null; sameDayProvisioningData?: unknown } & Partial<Parameters<typeof normalizePickup>[0]>) {
  try { const j = readProvisioningJournal(s.sameDayProvisioningData);
    return s.status === "ACTIVE" && s.offersSameDayDelivery && s.sameDayProvisioningStatus === "READY" &&
      !!s.shopifyFulfillmentServiceId && !!s.shopifyFulfillmentLocationId && !!j && !j.pending && !j.owner && GATES.every(g => j.completed.includes(g)) &&
      j.fingerprints.pickup === fingerprint(normalizePickup(s as Parameters<typeof normalizePickup>[0]));
  } catch { return false; }
}
