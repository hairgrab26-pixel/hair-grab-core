// Server-only transport. Dispatch callers enforce persisted seller ownership,
// payment, readiness and idempotency. Never retry uncertain mutations here.
// API contracts: https://docs.shipday.com/reference/shipday-api
const API_URL = "https://api.shipday.com";
const TIMEOUT_MS = 8_000;

export class ShipdayError extends Error {
  readonly code: "CONFIGURATION" | "REQUEST_FAILED" | "INVALID_RESPONSE" | "INVALID_INPUT";
  readonly status?: number;
  constructor(code: ShipdayError["code"], status?: number) {
    super(`Shipday ${code.toLowerCase().replaceAll("_", " ")}.`);
    this.name = "ShipdayError";
    this.code = code;
    this.status = status;
  }
}

type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ShipdayError("INVALID_RESPONSE");
  }
  return value as JsonObject;
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function identifier(value: unknown): string | null {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? String(value) : text(value);
}
function date(value: unknown): string | null {
  const input = text(value);
  return input && Number.isFinite(Date.parse(input)) ? new Date(input).toISOString() : null;
}
function orderId(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ShipdayError("INVALID_INPUT");
  return value;
}

// Only numeric decimal API amounts are accepted; null/empty never become free.
export function shipdayAmountToCents(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
  const [whole, fraction = ""] = String(value).split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

async function request(path: string, method = "GET", body?: unknown): Promise<unknown> {
  const key = process.env.SHIPDAY_API_KEY?.trim();
  if (!key) throw new ShipdayError("CONFIGURATION");
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(path.startsWith("/on-demand/")
          ? { Authorization: `Basic ${key}` }
          : { "x-api-key": key }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "error",
    });
    // Do not retain/log provider error bodies, request bodies, headers, or causes.
    if (!response.ok) throw new ShipdayError("REQUEST_FAILED", response.status);
    const raw: unknown = await response.json();
    // A provider echo must never return our credential, even in a known field.
    return JSON.parse(JSON.stringify(raw).split(key).join("[redacted]")) as unknown;
  } catch (error) {
    if (error instanceof ShipdayError) throw error;
    throw new ShipdayError("REQUEST_FAILED");
  }
}

export type ShipdayEstimate = {
  reference: string | null;
  provider: string | null;
  providerCostCents: number | null;
  pickupAt: string | null;
  deliveryAt: string | null;
  available: boolean;
};

function estimates(value: unknown): ShipdayEstimate[] {
  if (!Array.isArray(value)) throw new ShipdayError("INVALID_RESPONSE");
  return value.map((entry) => {
    const row = object(entry);
    const providerCostCents = shipdayAmountToCents(row.fee);
    const provider = text(row.name);
    return {
      reference: identifier(row.id),
      provider,
      providerCostCents,
      pickupAt: date(row.pickupTime),
      deliveryAt: date(row.deliveryTime),
      available: row.error === false && provider !== null && providerCostCents !== null,
    };
  });
}

export type ShipdayAvailabilityInput = {
  pickupAddress: string;
  deliveryAddress: string;
  pickUpTime?: string;
  deliveryTime?: string;
};

export type ShipdayOrderInput = {
  orderNumber: string;
  customerName: string;
  customerAddress: string;
  customerPhoneNumber: string;
  customerEmail?: string;
  restaurantName: string;
  restaurantAddress: string;
  restaurantPhoneNumber: string;
  expectedDeliveryDate?: string;
  expectedPickupTime?: string;
  expectedDeliveryTime?: string;
  pickupInstruction?: string;
  deliveryInstruction?: string;
  isCatering?: boolean;
};
export type ShipdayOrderItem = {
  sellerId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
};
type PodType = "PHOTO" | "SIGNATURE" | "PIN" | "NONE";
export type ShipdayAssignmentInput = {
  orderId: number;
  name: string;
  estimateReference: string;
  tipCents?: number;
  contactlessDelivery?: boolean;
  podType?: PodType;
};

function details(value: unknown) {
  const row = object(value);
  if (!text(row.status) || !identifier(row.orderId ?? row.orderID)) {
    throw new ShipdayError("INVALID_RESPONSE");
  }
  return {
    orderId: identifier(row.orderId ?? row.orderID)!,
    deliveryId: identifier(row.id),
    provider: text(row.thirdPartyName),
    reference: identifier(row.referenceId),
    status: text(row.status)!,
    trackingUrl: text(row.trackingUrl),
    providerCostCents: shipdayAmountToCents(row.thirdPartyFee),
    shipdayChargeCents: shipdayAmountToCents(row.shipdayCharge),
    totalBillableAmountCents: shipdayAmountToCents(row.totalBillableAmount),
    processingFeeCents: shipdayAmountToCents(row.processingFee),
    tipCents: shipdayAmountToCents(row.tip),
    billable: typeof row.billable === "boolean" ? row.billable : null,
    charged: typeof row.charged === "boolean" ? row.charged : null,
  };
}

export const shipday = {
  async findOrders(reference: string) {
    if (!text(reference)) throw new ShipdayError("INVALID_INPUT");
    const rows = await request(`/orders/${encodeURIComponent(reference)}`);
    if (!Array.isArray(rows)) throw new ShipdayError("INVALID_RESPONSE");
    return rows.map((value) => {
      const row = object(value);
      if (typeof row.orderId !== "number" || !text(row.orderNumber)) throw new ShipdayError("INVALID_RESPONSE");
      return { orderId: orderId(row.orderId), reference: text(row.orderNumber)! };
    });
  },
  async services() {
    const rows = await request("/on-demand/services");
    if (!Array.isArray(rows)) throw new ShipdayError("INVALID_RESPONSE");
    return rows.map((value) => {
      const row = object(value);
      return { name: text(row.name), enabled: row.status === true, production: row.prod === true };
    });
  },
  async availability(input: ShipdayAvailabilityInput) {
    if (!text(input.pickupAddress) || !text(input.deliveryAddress)) {
      throw new ShipdayError("INVALID_INPUT");
    }
    return estimates(await request("/on-demand/availability", "POST", input));
  },
  async insertOrder(sellerId: string, input: ShipdayOrderInput, items: ShipdayOrderItem[]) {
    // Seller identity travels with every item; a multi-seller insert fails closed.
    if (!text(sellerId) || !items.length || items.some((item) =>
      item.sellerId !== sellerId || !text(item.name) ||
      !Number.isSafeInteger(item.quantity) || item.quantity <= 0 ||
      !Number.isSafeInteger(item.unitPriceCents) || item.unitPriceCents < 0)) {
      throw new ShipdayError("INVALID_INPUT");
    }
    for (const field of [input.orderNumber, input.customerName, input.customerAddress,
      input.customerPhoneNumber, input.restaurantName, input.restaurantAddress,
      input.restaurantPhoneNumber]) {
      if (!text(field)) throw new ShipdayError("INVALID_INPUT");
    }
    const result = object(await request("/orders", "POST", {
      ...input,
      orderSource: "HairGrab",
      paymentMethod: "credit_card",
      orderItem: items.map((item) => ({
        name: item.name, quantity: item.quantity, unitPrice: item.unitPriceCents / 100,
      })),
    }));
    if (result.success !== true || typeof result.orderId !== "number") {
      throw new ShipdayError("INVALID_RESPONSE");
    }
    return { orderId: orderId(result.orderId) };
  },
  async estimate(id: number) {
    return estimates(await request(`/on-demand/estimate/${orderId(id)}`));
  },
  async assign(input: ShipdayAssignmentInput) {
    orderId(input.orderId);
    if (!text(input.name) || !text(input.estimateReference) ||
        (input.tipCents !== undefined && (!Number.isSafeInteger(input.tipCents) || input.tipCents < 0))) {
      throw new ShipdayError("INVALID_INPUT");
    }
    const { tipCents, ...assignment } = input;
    return details(await request("/on-demand/assign", "POST", {
      ...assignment,
      ...(tipCents === undefined ? {} : { tip: tipCents / 100 }),
    }));
  },
  async details(id: number) {
    return details(await request(`/on-demand/details/${orderId(id)}`));
  },
  async cancel(id: number) {
    const result = object(await request(`/on-demand/cancel/${orderId(id)}`, "POST"));
    if (result.success !== true) throw new ShipdayError("INVALID_RESPONSE");
    // Cancellation success does not mean a refund or zero billable cost.
    return { success: true as const };
  },
};
