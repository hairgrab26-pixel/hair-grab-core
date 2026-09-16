export type DispatchLine = { lineId: string; quantity: number; name: string; unitPriceCents: number };
export type CourierBilling = {
  at: string;
  providerCostCents: number | null;
  shipdayChargeCents: number | null;
  totalBillableAmountCents: number | null;
  processingFeeCents: number | null;
  tipCents: number | null;
  billable: boolean | null;
  charged: boolean | null;
};
export type CourierDispatchData = {
  version: 1;
  operationId: string;
  operationAt: string;
  externalReference: string;
  shop: string;
  sellerId: string;
  orderId: string;
  lines: DispatchLine[];
  pickupFingerprint: string;
  destinationFingerprint: string;
  preflightProviderCostCents: number | null;
  assignmentEstimateCents: number | null;
  intendedShopperChargeCents: number | null;
  expectedMarginCents: number | null;
  pricingPolicyVersion: string | null;
  // Retained legacy field; canonical actual charge is the separately reconciled value below.
  shopifyDeliveryChargeCents: null;
  actualShopifyDeliveryChargeCents?: number | null;
  providerCostCents?: number | null;
  shopperDeliveryChargeCents?: number | null;
  expectedHairGrabDeliveryMarginCents?: number | null;
  fulfillmentOrderId?: string;
  shopifyLifecycle?: { pending: string | null; fulfillmentId: string | null; updatedAt: string };
  currency: "USD";
  cancellationRequestedAt: string | null;
  assignmentBilling: CourierBilling | null;
  latestBilling: CourierBilling | null;
  cancellationBilling: CourierBilling | null;
};

const cents = (n: unknown) => n === null || (Number.isSafeInteger(n) && Number(n) >= 0);
const timestamp = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
function billing(value: unknown): boolean {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return timestamp(v.at) && ["providerCostCents", "shipdayChargeCents", "totalBillableAmountCents",
    "processingFeeCents", "tipCents"].every((key) => cents(v[key])) &&
    ["billable", "charged"].every((key) => v[key] === null || typeof v[key] === "boolean");
}
export function parseCourierDispatchData(value: unknown): CourierDispatchData {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid dispatch snapshot.");
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || v.currency !== "USD" || v.shopifyDeliveryChargeCents !== null ||
      (v.actualShopifyDeliveryChargeCents !== undefined && !cents(v.actualShopifyDeliveryChargeCents)) ||
      ["providerCostCents", "shopperDeliveryChargeCents", "expectedHairGrabDeliveryMarginCents"].some(k => v[k] !== undefined && !cents(v[k])) ||
      !timestamp(v.operationAt) ||
      !["operationId", "externalReference", "shop", "sellerId", "orderId", "pickupFingerprint", "destinationFingerprint"]
        .every((key) => typeof v[key] === "string" && (v[key] as string).length > 0) ||
      !["preflightProviderCostCents", "assignmentEstimateCents", "intendedShopperChargeCents", "expectedMarginCents"].every((key) => cents(v[key])) ||
      !(v.pricingPolicyVersion === null || typeof v.pricingPolicyVersion === "string") ||
      !(v.cancellationRequestedAt === null || timestamp(v.cancellationRequestedAt)) ||
      ![v.assignmentBilling, v.latestBilling, v.cancellationBilling].every(billing) ||
      !Array.isArray(v.lines) || !v.lines.length || v.lines.some((line) => !line ||
        typeof line.lineId !== "string" || !line.lineId || typeof line.name !== "string" || !line.name ||
        !Number.isSafeInteger(line.quantity) || line.quantity <= 0 ||
        line.unitPriceCents === null || !cents(line.unitPriceCents)) ||
      new Set(v.lines.map((line) => line.lineId)).size !== v.lines.length) {
    throw new Error("Invalid dispatch snapshot.");
  }
  return value as CourierDispatchData;
}
